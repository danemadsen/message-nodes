import {
  addNode,
  branchNode,
  deleteNode,
  getAncestry,
  getChildren,
  getConversation,
  getNode,
  getRoot,
  getRoots,
  hasNode,
  lastChild,
  makeRoot,
  MessageNode,
  nextChild,
  setChild,
  unlinkNode,
  updateContent,
} from "./index";

function createMessage(id: string, parent?: string, child?: string): MessageNode {
  return {
    id,
    role: "user",
    content: id,
    root: "root",
    parent,
    child,
    createTime: new Date(),
    updateTime: new Date(),
  };
}

function makeLinearMappings(): Record<string, MessageNode> {
  const mappings: Record<string, MessageNode> = {};
  // root -> a -> b -> c
  mappings["root"] = createMessage("root", undefined, "a");
  mappings["a"] = createMessage("a", "root", "b");
  mappings["b"] = createMessage("b", "a", "c");
  mappings["c"] = createMessage("c", "b", undefined);
  return mappings;
}

describe("hasNode", () => {
  test("returns true when node exists and false otherwise", () => {
    const mappings = makeLinearMappings();
    expect(hasNode(mappings, "root")).toBe(true);
    expect(hasNode(mappings, "ghost")).toBe(false);
  });
});

describe("getNode", () => {
  test("returns node when it exists, undefined otherwise", () => {
    const mappings = makeLinearMappings();
    expect(getNode(mappings, "a")?.id).toBe("a");
    expect(getNode(mappings, "ghost")).toBeUndefined();
  });
});

describe("getRoot", () => {
  test("returns the root node by walking parent pointers", () => {
    const mappings = makeLinearMappings();
    expect(getRoot(mappings, "c")?.id).toBe("root");
    expect(getRoot(mappings, "root")?.id).toBe("root");
  });

  test("returns undefined for unknown id", () => {
    const mappings = makeLinearMappings();
    expect(getRoot(mappings, "ghost")).toBeUndefined();
  });
});

describe("getRoots", () => {
  test("returns empty array for empty mappings", () => {
    expect(getRoots({})).toEqual([]);
  });

  test("returns the single root in a linear mapping", () => {
    const mappings = makeLinearMappings();
    expect(getRoots(mappings).map((n) => n.id)).toEqual(["root"]);
  });

  test("returns multiple roots when multiple root nodes exist", () => {
    let mappings = makeLinearMappings();
    mappings = addNode(mappings, "r2", "user", "hello", "ignored", undefined, undefined);

    expect(getRoots(mappings).map((n) => n.id).sort()).toEqual(["r2", "root"]);
  });

  test("includes nodes that became roots via unlinkNode", () => {
    let mappings = makeLinearMappings();
    mappings = unlinkNode(mappings, "b");

    expect(getRoots(mappings).map((n) => n.id).sort()).toEqual(["b", "root"]);
  });
});

describe("getConversation", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("returns linear thread from root", () => {
    const convo = getConversation(mappings, "root");
    expect(convo.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  test("returns empty if root has no child", () => {
    mappings["loner"] = createMessage("loner");
    expect(getConversation(mappings, "loner")).toEqual([]);
  });

  test("returns empty and warns if root id not in mappings", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(getConversation(mappings, "missing-root")).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("stops traversal when child pointer is missing in mappings", () => {
    mappings["b"]!.child = "zzz";
    const convo = getConversation(mappings, "root");
    expect(convo.map((m) => m.id)).toEqual(["a", "b"]);
  });

  test("detects a cycle and warns (does not infinite loop)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // create cycle: c -> a
    mappings["c"]!.child = "a";

    const convo = getConversation(mappings, "root");

    expect(convo.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("getAncestry", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("returns [node, parent, ..., root]", () => {
    const ancestry = getAncestry(mappings, "c");
    expect(ancestry.map((m) => m.id)).toEqual(["c", "b", "a", "root"]);
  });

  test("returns [root] for a root node", () => {
    const ancestry = getAncestry(mappings, "root");
    expect(ancestry.map((m) => m.id)).toEqual(["root"]);
  });

  test("returns empty and warns for unknown id", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(getAncestry(mappings, "ghost")).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("detects a parent-cycle and warns (does not infinite loop)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // create cycle in parent chain: a.parent = c
    mappings["a"]!.parent = "c";

    const ancestry = getAncestry(mappings, "c");

    // c -> b -> a then would go back to c, so it stops before repeating c
    expect(ancestry.map((m) => m.id)).toEqual(["c", "b", "a"]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("getChildren", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("returns all direct children", () => {
    mappings["a2"] = createMessage("a2", "a");
    const children = getChildren(mappings, "a");
    expect(children.map((c) => c.id).sort()).toEqual(["a2", "b"]);
  });

  test("returns empty if parent has no children", () => {
    expect(getChildren(mappings, "c")).toEqual([]);
  });

  test("returns empty for unknown parent id", () => {
    expect(getChildren(mappings, "ghost")).toEqual([]);
  });
});

describe("setChild", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("sets parent.child when relationship is valid (child.parent === parent)", () => {
    mappings = setChild(mappings, "a", "b");
    expect(mappings["a"]!.child).toBe("b");
  });

  test("does not set parent.child if child is not a child of that parent", () => {
    // b.parent is "a", so trying to set root.child to b should be ignored
    const before = mappings["root"]!.child;
    mappings = setChild(mappings, "root", "b");
    expect(mappings["root"]!.child).toBe(before);
  });

  test("clears parent.child when child is undefined", () => {
    expect(mappings["a"]!.child).toBe("b");
    mappings = setChild(mappings, "a", undefined);
    expect(mappings["a"]!.child).toBeUndefined();
  });

  test("does nothing if parent does not exist", () => {
    mappings = setChild(mappings, "ghost", "a"); // should not throw
    expect(mappings).toBeDefined();
  });
});

describe("nextChild", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("switches active child pointer to next sibling", () => {
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "a"; // current = a

    mappings = nextChild(mappings, "root");

    expect(mappings["root"]!.child).toBe("x");
    expect(mappings["x"]!.parent).toBe("root");
  });

  test("warns if no child found for parent (current child pointer not in children)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings["root"]!.child = "not-a-real-child-id";

    mappings = nextChild(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns if no next child available (already at last sibling)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "x"; // last sibling; children order [a, x]

    mappings = nextChild(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns if parent id missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings = nextChild(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("lastChild", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("switches active child pointer to previous sibling", () => {
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "x"; // current = x (2nd)

    mappings = lastChild(mappings, "root");

    expect(mappings["root"]!.child).toBe("a");
  });

  test("warns if no child found for parent (current child pointer not in children)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings["root"]!.child = "not-a-real-child-id";

    mappings = lastChild(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns if no previous child available (already at first sibling)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "a"; // first sibling

    mappings = lastChild(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns if parent id missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings = lastChild(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("unlinkNode", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("detaches from parent and child, and becomes its own root", () => {
    // before: a -> b -> c
    expect(mappings["a"]!.child).toBe("b");
    expect(mappings["c"]!.parent).toBe("b");

    mappings = unlinkNode(mappings, "b");

    expect(mappings["a"]!.child).toBeUndefined(); // parent no longer points to b
    expect(mappings["c"]!.parent).toBeUndefined(); // child no longer points to b
    expect(mappings["b"]!.parent).toBeUndefined();
    expect(mappings["b"]!.child).toBeUndefined();
    expect(mappings["b"]!.root).toBe("b");
  });

  test("does nothing for missing node", () => {
    mappings = unlinkNode(mappings, "ghost"); // should not throw
    expect(mappings).toBeDefined();
  });
});

describe("deleteNode", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("removes node and all descendants", () => {
    mappings = deleteNode(mappings, "a");

    expect(mappings["a"]).toBeUndefined();
    expect(mappings["b"]).toBeUndefined();
    expect(mappings["c"]).toBeUndefined();
    expect(mappings["root"]).toBeDefined();
  });

  test("removes only that subtree when parent has multiple children", () => {
    mappings["a2"] = createMessage("a2", "root");
    mappings["a2-child"] = createMessage("a2-child", "a2");

    mappings = deleteNode(mappings, "a2");

    expect(mappings["a2"]).toBeUndefined();
    expect(mappings["a2-child"]).toBeUndefined();

    expect(mappings["a"]).toBeDefined();
    expect(mappings["b"]).toBeDefined();
    expect(mappings["c"]).toBeDefined();
  });

  test("warns for missing node", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings = deleteNode(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("detects a cycle via parent pointers and warns (does not infinite loop)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // Create a cycle in the 'parent' graph:
    // root is child of c, while c is descendant of root in the chain
    mappings["root"]!.parent = "c";

    mappings = deleteNode(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    // Should still delete everything reachable without hanging
    expect(Object.keys(mappings).length).toBe(0);

    warnSpy.mockRestore();
  });
});

describe("makeRoot", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("detaches from parent but preserves subtree; rewrites root for descendants", () => {
    // before: root -> a -> b -> c
    expect(mappings["a"]!.child).toBe("b");
    expect(mappings["b"]!.child).toBe("c");
    expect(mappings["c"]!.parent).toBe("b");

    mappings = makeRoot(mappings, "b");

    // b is now a root
    expect(mappings["b"]!.parent).toBeUndefined();
    expect(mappings["b"]!.root).toBe("b");

    // parent detached
    expect(mappings["a"]!.child).toBeUndefined();

    // subtree preserved
    expect(mappings["b"]!.child).toBe("c");
    expect(mappings["c"]!.parent).toBe("b");

    // descendants re-rooted
    expect(mappings["c"]!.root).toBe("b");

    // ancestors unchanged
    expect(mappings["root"]!.root).toBe("root");
    expect(mappings["a"]!.root).toBe("root");

    // integration: conversation from new root is just [c]
    expect(getConversation(mappings, "b").map((m) => m.id)).toEqual(["c"]);
  });

  test("re-roots branching descendants (via getChildren traversal)", () => {
    // Add a branching child under b that is NOT in the child chain
    mappings["b2"] = createMessage("b2", "b");
    mappings["b2"]!.root = "root";

    mappings = makeRoot(mappings, "b");

    expect(mappings["b2"]!.root).toBe("b");
    expect(mappings["b2"]!.parent).toBe("b");
  });

  test("warns if node missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings = makeRoot(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("addNode", () => {
  let mappings: Record<string, MessageNode>;

  const d1 = new Date("2020-01-01T00:00:00.000Z");
  const d2 = new Date("2020-01-02T00:00:00.000Z");

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("inserts new node and links parent", () => {
    mappings = addNode(mappings, "new", "assistant", "hi", "root", "c", undefined);

    expect(mappings["new"]).toBeDefined();
    expect(mappings["new"]!.parent).toBe("c");
    expect(mappings["c"]!.child).toBe("new");
  });

  test("computes root from parent chain (ignores provided root)", () => {
    mappings = addNode(mappings, "n1", "assistant", "x", "WRONG_ROOT", "c", undefined);
    expect(mappings["n1"]!.root).toBe("root"); // derived from getRoot(c)
  });

  test("creates a root node when parent is undefined (root becomes id)", () => {
    mappings = addNode(mappings, "r2", "user", "hello", "root", undefined, undefined, d1, d2);

    expect(mappings["r2"]).toBeDefined();
    expect(mappings["r2"]!.root).toBe("r2");
    expect(mappings["r2"]!.parent).toBeUndefined();
    expect(mappings["r2"]!.child).toBeUndefined();
  });

  test("when parent exists, root is derived even if root param is undefined", () => {
    mappings = addNode(mappings, "n2", "assistant", "x", undefined, "b", undefined);
    expect(mappings["n2"]!.root).toBe("root");
    expect(mappings["b"]!.child).toBe("n2");
  });

  test("links provided child back to new node (sets child's parent)", () => {
    mappings = addNode(mappings, "x", "assistant", "mid", "root", "b", "c", d1, d2);

    expect(mappings["x"]!.parent).toBe("b");
    expect(mappings["x"]!.child).toBe("c");
    expect(mappings["b"]!.child).toBe("x");
    expect(mappings["c"]!.parent).toBe("x");
  });

  test("warns and does nothing if ID already exists", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings = addNode(mappings, "a", "assistant", "dup", "root", undefined, undefined);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns and does nothing if parent does not exist", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings = addNode(mappings, "x", "user", "badparent", "root", "missing-parent", undefined);
    expect(warnSpy).toHaveBeenCalled();
    expect(mappings["x"]).toBeUndefined();
    warnSpy.mockRestore();
  });

  test("warns and does nothing if child does not exist (and does not mutate parent)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings["b"]!.child;

    mappings = addNode(mappings, "x", "user", "badchild", "root", "b", "missing-child");

    expect(warnSpy).toHaveBeenCalled();
    expect(mappings["x"]).toBeUndefined();
    expect(mappings["b"]!.child).toBe(before); // no partial mutation now
    warnSpy.mockRestore();
  });

  test("persists createTime and updateTime parameters", () => {
    mappings = addNode(mappings, "t", "assistant", "time", "root", "c", undefined, d1, d2);
    expect(mappings["t"]!.createTime).toBe(d1);
    expect(mappings["t"]!.updateTime).toBe(d2);
  });

  test("sets parent.child to new node even if parent already had a child (overwrites)", () => {
    mappings = addNode(mappings, "newFirst", "user", "n", "root", "root", undefined);

    expect(mappings["root"]!.child).toBe("newFirst");
    expect(mappings["newFirst"]!.parent).toBe("root");
  });
});

describe("branchNode", () => {
  let mappings: Record<string, MessageNode>;

  const d1 = new Date("2020-01-01T00:00:00.000Z");
  const d2 = new Date("2020-01-02T00:00:00.000Z");

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("creates a sibling under the same parent and makes it the active child", () => {
    // b's parent is a
    expect(mappings["b"]!.parent).toBe("a");
    expect(mappings["a"]!.child).toBe("b");

    mappings = branchNode(mappings, "b", "b2", "hello", d1, d2);

    expect(mappings["b2"]).toBeDefined();
    expect(mappings["b2"]!.parent).toBe("a");
    expect(mappings["b2"]!.root).toBe("root");
    expect(mappings["b2"]!.role).toBe(mappings["b"]!.role);
    expect(mappings["b2"]!.content).toBe("hello");
    expect(mappings["b2"]!.createTime).toBe(d1);
    expect(mappings["b2"]!.updateTime).toBe(d2);

    // parent now points to sibling as active branch
    expect(mappings["a"]!.child).toBe("b2");

    // original node remains intact
    expect(mappings["b"]!.parent).toBe("a");
    expect(mappings["b"]!.child).toBe("c");
  });

  test("warns and returns original mappings if source node is missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    const next = branchNode(mappings, "ghost", "x", "nope", d1, d2);

    expect(warnSpy).toHaveBeenCalled();
    expect(next).toBe(before);
    warnSpy.mockRestore();
  });

  test("warns and returns original mappings if sibling id already exists", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    const next = branchNode(mappings, "b", "c", "dup", d1, d2); // "c" already exists

    expect(warnSpy).toHaveBeenCalled();
    expect(next).toBe(before);
    warnSpy.mockRestore();
  });

  test("warns and returns original mappings if parent pointer exists but parent node missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    // corrupt mapping: b claims parent "missing", but node not present
    mappings["b"]!.parent = "missing";

    const next = branchNode(mappings, "b", "b2", "x", d1, d2);

    expect(warnSpy).toHaveBeenCalled();
    expect(next).toBe(before);
    warnSpy.mockRestore();
  });

  test("branches a root node by creating a new root sibling (parent undefined => new root)", () => {
    expect(mappings["root"]!.parent).toBeUndefined();

    mappings = branchNode(mappings, "root", "r2", "hi", d1, d2);

    expect(mappings["r2"]).toBeDefined();
    expect(mappings["r2"]!.parent).toBeUndefined();
    expect(mappings["r2"]!.child).toBeUndefined();
    expect(mappings["r2"]!.root).toBe("r2"); // addNode makes it a root when parent undefined
    expect(mappings["r2"]!.role).toBe(mappings["root"]!.role);
    expect(mappings["r2"]!.content).toBe("hi");
  });

  test("preserves referential equality for no-op failure cases", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    const next1 = branchNode(mappings, "ghost", "x", "nope");
    const next2 = branchNode(mappings, "b", "c", "dup");

    expect(next1).toBe(before);
    expect(next2).toBe(before);

    warnSpy.mockRestore();
  });
});

describe("updateContent", () => {
  let mappings: Record<string, MessageNode>;

  const d1 = new Date("2020-01-01T00:00:00.000Z");
  const d2 = new Date("2020-01-02T00:00:00.000Z");

  beforeEach(() => {
    mappings = makeLinearMappings();
    // make times deterministic
    mappings["b"]!.updateTime = d1;
  });

  test("replaces content and updates updateTime", () => {
    const next = updateContent(mappings, "b", "NEW", d2);

    expect(next).not.toBe(mappings);
    expect(next["b"]!.content).toBe("NEW");
    expect(next["b"]!.updateTime).toBe(d2);

    // other nodes untouched
    expect(next["a"]).toBe(mappings["a"]);
  });

  test("supports functional updater for strings", () => {
    const next = updateContent(mappings, "b", (prev) => prev + "++", d2);
    expect(next["b"]!.content).toBe("b++");
    expect(next["b"]!.updateTime).toBe(d2);
  });

  test("supports functional updater for non-string types", () => {
    type Obj = { n: number; xs: number[] };

    const objMappings: Record<string, MessageNode<Obj>> = {
      root: {
        id: "root",
        role: "user",
        content: { n: 0, xs: [] },
        root: "root",
        parent: undefined,
        child: "a",
        createTime: d1,
        updateTime: d1,
      },
      a: {
        id: "a",
        role: "user",
        content: { n: 1, xs: [1] },
        root: "root",
        parent: "root",
        child: undefined,
        createTime: d1,
        updateTime: d1,
      },
    };

    const next = updateContent(objMappings, "a", (prev) => ({ n: prev.n + 1, xs: [...prev.xs, 2] }), d2);

    expect(next["a"]!.content).toEqual({ n: 2, xs: [1, 2] });
    expect(next["a"]!.updateTime).toBe(d2);
  });

  test("warns and returns original mappings if node missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    const next = updateContent(mappings, "ghost", "x", d2);

    expect(warnSpy).toHaveBeenCalled();
    expect(next).toBe(before);

    warnSpy.mockRestore();
  });

  test("returns original mappings when content and updateTime are unchanged (no-op)", () => {
    const before = mappings;
    const next = updateContent(mappings, "b", "b", d1); // same content, same updateTime
    expect(next).toBe(before);
  });

  test("returns new mappings when content is same but updateTime differs", () => {
    const before = mappings;
    const next = updateContent(mappings, "b", "b", d2); // same content, different updateTime
    expect(next).not.toBe(before);
    expect(next["b"]!.content).toBe("b");
    expect(next["b"]!.updateTime).toBe(d2);
  });

  test("returns new mappings when updateTime same but content differs", () => {
    const before = mappings;
    const next = updateContent(mappings, "b", "changed", d1);
    expect(next).not.toBe(before);
    expect(next["b"]!.content).toBe("changed");
    expect(next["b"]!.updateTime).toBe(d1);
  });
});
