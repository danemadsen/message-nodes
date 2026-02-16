import {
  addNode,
  branchNode,
  deleteNode,
  getAncestry,
  getChildren,
  getConversation,
  getNode,
  getRoot,
  getRootMapping,
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

function createMessage(
  id: string,
  parent?: string,
  child?: string,
  root?: string,
  metadata?: Record<string, any>
): MessageNode {
  const computedRoot = root ?? (parent ? "root" : id);
  return {
    id,
    role: "user",
    content: id,
    root: computedRoot,
    parent,
    child,
    metadata,
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

  test("returns linear thread from root (including root)", () => {
    const convo = getConversation(mappings, "root");
    expect(convo.map((m) => m.id)).toEqual(["root", "a", "b", "c"]);
  });

  test("returns [root] if root has no child", () => {
    mappings["loner"] = createMessage("loner"); // root=loner, no child
    expect(getConversation(mappings, "loner").map((m) => m.id)).toEqual(["loner"]);
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
    expect(convo.map((m) => m.id)).toEqual(["root", "a", "b"]);
  });

  test("detects a cycle and warns (does not infinite loop)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // create cycle: c -> a
    mappings["c"]!.child = "a";

    const convo = getConversation(mappings, "root");

    expect(convo.map((m) => m.id)).toEqual(["root", "a", "b", "c"]);
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

describe("getRootMapping", () => {
  test("returns only the subtree connected to the given root (linear)", () => {
    const mappings = makeLinearMappings(); // root -> a -> b -> c

    const sub = getRootMapping(mappings, "root");

    expect(Object.keys(sub).sort()).toEqual(["root", "a", "b", "c"].sort());
  });

  test("excludes other roots and their lineages", () => {
    const mappings = makeLinearMappings();
    // Add separate root: r2 -> r2a
    mappings["r2"] = createMessage("r2", undefined, "r2a", "r2");
    mappings["r2a"] = createMessage("r2a", "r2", undefined, "r2");

    const sub = getRootMapping(mappings, "root");

    expect(Object.keys(sub).sort()).toEqual(["root", "a", "b", "c"].sort());
    expect(sub["r2"]).toBeUndefined();
    expect(sub["r2a"]).toBeUndefined();
  });

  test("includes branching descendants under the root", () => {
    const mappings = makeLinearMappings();
    // Create a branch: a -> b2 -> b2c (sibling of b under a)
    mappings["b2"] = createMessage("b2", "a", "b2c", "root");
    mappings["b2c"] = createMessage("b2c", "b2", undefined, "root");

    const sub = getRootMapping(mappings, "root");

    expect(Object.keys(sub).sort()).toEqual(
      ["root", "a", "b", "c", "b2", "b2c"].sort()
    );
  });

  test("does not include nodes that merely claim the same root but are not connected", () => {
    const mappings = makeLinearMappings();
    // x "claims" root but is disconnected (no parent link into the subtree)
    mappings["x"] = createMessage("x", undefined, undefined, "root");

    const sub = getRootMapping(mappings, "root");

    expect(sub["x"]).toBeUndefined();
    expect(Object.keys(sub).sort()).toEqual(["root", "a", "b", "c"].sort());
  });

  test("warns and returns empty object for missing rootId", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const mappings = makeLinearMappings();

    const sub = getRootMapping(mappings, "ghost-root");

    expect(sub).toEqual({});
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test("detects cycles in descendant graph and does not infinite loop", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const mappings = makeLinearMappings();

    // Create a parent-cycle: root becomes child of c, forming:
    // root -> a -> b -> c -> root
    mappings["root"]!.parent = "c";

    const sub = getRootMapping(mappings, "root");

    expect(Object.keys(sub).sort()).toEqual(["root", "a", "b", "c"].sort());
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
    mappings = setChild(mappings, "ghost", "a");
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
    mappings["root"]!.child = "a";

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
    mappings["root"]!.child = "x"; // children order is implementation-dependent; this test just expects warning

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
    mappings["root"]!.child = "x";

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
    mappings["root"]!.child = "a";

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
    expect(mappings["a"]!.child).toBe("b");
    expect(mappings["c"]!.parent).toBe("b");

    mappings = unlinkNode(mappings, "b");

    expect(mappings["a"]!.child).toBeUndefined();
    expect(mappings["c"]!.parent).toBeUndefined();
    expect(mappings["b"]!.parent).toBeUndefined();
    expect(mappings["b"]!.child).toBeUndefined();
    expect(mappings["b"]!.root).toBe("b");
  });

  test("does nothing for missing node", () => {
    mappings = unlinkNode(mappings, "ghost");
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
    // Make root a child of c, so when deleting root -> ... -> c,
    // c's children include root (cycle), triggering seen-guard.
    mappings["root"]!.parent = "c";

    mappings = deleteNode(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
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
    expect(mappings["a"]!.child).toBe("b");
    expect(mappings["b"]!.child).toBe("c");
    expect(mappings["c"]!.parent).toBe("b");

    mappings = makeRoot(mappings, "b");

    expect(mappings["b"]!.parent).toBeUndefined();
    expect(mappings["b"]!.root).toBe("b");

    expect(mappings["a"]!.child).toBeUndefined();

    expect(mappings["b"]!.child).toBe("c");
    expect(mappings["c"]!.parent).toBe("b");
    expect(mappings["c"]!.root).toBe("b");

    expect(mappings["root"]!.root).toBe("root");
    expect(mappings["a"]!.root).toBe("root");

    expect(getConversation(mappings, "b").map((m) => m.id)).toEqual(["b", "c"]);
  });

  test("re-roots branching descendants (via getChildren traversal)", () => {
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
    expect(mappings["n1"]!.root).toBe("root");
  });

  test("creates a root node when parent is undefined (root becomes id)", () => {
    const md = { createdAt: "2020-01-01", updatedAt: "2020-01-02" } as Record<string, any>;
    mappings = addNode(mappings, "r2", "user", "hello", "root", undefined, undefined, md);

    expect(mappings["r2"]).toBeDefined();
    expect(mappings["r2"]!.root).toBe("r2");
    expect(mappings["r2"]!.parent).toBeUndefined();
    expect(mappings["r2"]!.child).toBeUndefined();
    expect(mappings["r2"]!.metadata).toEqual(md);
  });

  test("when parent exists, root is derived even if root param is undefined", () => {
    mappings = addNode(mappings, "n2", "assistant", "x", undefined, "b", undefined);
    expect(mappings["n2"]!.root).toBe("root");
    expect(mappings["b"]!.child).toBe("n2");
  });

  test("links provided child back to new node (sets child's parent)", () => {
    const md = { kind: "insert-mid" } as Record<string, any>;
    mappings = addNode(mappings, "x", "assistant", "mid", "root", "b", "c", md);

    expect(mappings["x"]!.parent).toBe("b");
    expect(mappings["x"]!.child).toBe("c");
    expect(mappings["x"]!.metadata).toEqual(md);
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
    expect(mappings["b"]!.child).toBe(before);
    warnSpy.mockRestore();
  });

  test("persists metadata parameter", () => {
    const md = { foo: 1, bar: "baz" } as Record<string, any>;
    mappings = addNode(mappings, "t", "assistant", "meta", "root", "c", undefined, md);
    expect(mappings["t"]!.metadata).toEqual(md);
  });

  test("sets parent.child to new node even if parent already had a child (overwrites)", () => {
    mappings = addNode(mappings, "newFirst", "user", "n", "root", "root", undefined);

    expect(mappings["root"]!.child).toBe("newFirst");
    expect(mappings["newFirst"]!.parent).toBe("root");
  });
});

describe("branchNode", () => {
  let mappings: Record<string, MessageNode>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("creates a sibling under the same parent and makes it the active child", () => {
    expect(mappings["b"]!.parent).toBe("a");
    expect(mappings["a"]!.child).toBe("b");

    const md = { branched: true } as Record<string, any>;
    mappings = branchNode(mappings, "b", "b2", "hello", md);

    expect(mappings["b2"]).toBeDefined();
    expect(mappings["b2"]!.parent).toBe("a");
    expect(mappings["b2"]!.root).toBe("root");
    expect(mappings["b2"]!.role).toBe(mappings["b"]!.role);
    expect(mappings["b2"]!.content).toBe("hello");
    expect(mappings["b2"]!.metadata).toEqual(md);

    expect(mappings["a"]!.child).toBe("b2");

    expect(mappings["b"]!.parent).toBe("a");
    expect(mappings["b"]!.child).toBe("c");
  });

  test("warns and returns original mappings if source node is missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    const next = branchNode(mappings, "ghost", "x", "nope");

    expect(warnSpy).toHaveBeenCalled();
    expect(next).toBe(before);
    warnSpy.mockRestore();
  });

  test("warns and returns original mappings if sibling id already exists", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    const next = branchNode(mappings, "b", "c", "dup");

    expect(warnSpy).toHaveBeenCalled();
    expect(next).toBe(before);
    warnSpy.mockRestore();
  });

  test("warns and returns original mappings if parent pointer exists but parent node missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    mappings["b"]!.parent = "missing";

    const next = branchNode(mappings, "b", "b2", "x");

    expect(warnSpy).toHaveBeenCalled();
    expect(next).toBe(before);
    warnSpy.mockRestore();
  });

  test("branches a root node by creating a new root sibling (parent undefined => new root)", () => {
    expect(mappings["root"]!.parent).toBeUndefined();

    mappings = branchNode(mappings, "root", "r2", "hi", { rootBranch: true } as Record<string, any>);

    expect(mappings["r2"]).toBeDefined();
    expect(mappings["r2"]!.parent).toBeUndefined();
    expect(mappings["r2"]!.child).toBeUndefined();
    expect(mappings["r2"]!.root).toBe("r2");
    expect(mappings["r2"]!.role).toBe(mappings["root"]!.role);
    expect(mappings["r2"]!.content).toBe("hi");
    expect(mappings["r2"]!.metadata).toEqual({ rootBranch: true });
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

  beforeEach(() => {
    mappings = makeLinearMappings();
    mappings["b"]!.metadata = { updatedAt: "t1", n: 1 };
  });

  test("replaces content and can update metadata", () => {
    const md2 = { updatedAt: "t2", n: 2 } as Record<string, any>;
    const next = updateContent(mappings, "b", "NEW", md2);

    expect(next).not.toBe(mappings);
    expect(next["b"]!.content).toBe("NEW");
    expect(next["b"]!.metadata).toEqual(md2);

    // other nodes untouched (same object refs)
    expect(next["a"]).toBe(mappings["a"]);
  });

  test("supports functional updater for strings", () => {
    const next = updateContent(mappings, "b", (prev) => prev + "++", { updatedAt: "t2" } as Record<string, any>);
    expect(next["b"]!.content).toBe("b++");
    expect(next["b"]!.metadata).toEqual({ updatedAt: "t2" });
  });

  test("supports functional updater for non-string content types", () => {
    type Obj = { n: number; xs: number[] };

    const objMappings: Record<string, MessageNode<Obj>> = {
      root: {
        id: "root",
        role: "user",
        content: { n: 0, xs: [] },
        root: "root",
        parent: undefined,
        child: "a",
        metadata: { updatedAt: "t1" },
      },
      a: {
        id: "a",
        role: "user",
        content: { n: 1, xs: [1] },
        root: "root",
        parent: "root",
        child: undefined,
        metadata: { updatedAt: "t1" },
      },
    };

    const next = updateContent(
      objMappings,
      "a",
      (prev) => ({ n: prev.n + 1, xs: [...prev.xs, 2] }),
      (prev) => ({ ...(prev ?? {}), updatedAt: "t2" })
    );

    expect(next["a"]!.content).toEqual({ n: 2, xs: [1, 2] });
    expect(next["a"]!.metadata).toEqual({ updatedAt: "t2" });
  });

  test("warns and returns original mappings if node missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = mappings;

    const next = updateContent<string, Record<string, any>>(mappings, "ghost", "x", { updatedAt: "t2" } as Record<string, any>);

    expect(warnSpy).toHaveBeenCalled();
    expect(next).toBe(before);

    warnSpy.mockRestore();
  });

  test("returns original mappings when content is unchanged (no-op)", () => {
    const before = mappings;
    const next = updateContent<string, Record<string, any>>(mappings, "b", "b");
    expect(next).toBe(before);
  });

  test("does not overwrite metadata when metadata param is undefined", () => {
    const beforeMd = mappings["b"]!.metadata;
    const next = updateContent<string, Record<string, any>>(mappings, "b", "changed", undefined);

    expect(next).not.toBe(mappings);
    expect(next["b"]!.content).toBe("changed");
    expect(next["b"]!.metadata).toBe(beforeMd);
  });

  test("supports functional metadata updater (when metadata exists)", () => {
    const next = updateContent<string, Record<string, any>>(
      mappings,
      "b",
      "changed",
      (prev) => ({ ...(prev ?? {}), n: (prev?.n ?? 0) + 1, updatedAt: "t2" }) as Record<string, any>
    );

    expect(next["b"]!.content).toBe("changed");
    expect(next["b"]!.metadata).toEqual({ updatedAt: "t2", n: 2 });
  });
});
