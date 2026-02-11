import {
  addNode,
  ChatMessage,
  deleteNode,
  getChildren,
  getConversation,
  lastChild,
  makeRoot,
  nextChild,
} from "./index";

function createMessage(id: string, parent?: string, child?: string): ChatMessage {
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

function makeLinearMappings(): Record<string, ChatMessage> {
  const mappings: Record<string, ChatMessage> = {};
  // root -> a -> b -> c
  mappings["root"] = createMessage("root", undefined, "a");
  mappings["a"] = createMessage("a", "root", "b");
  mappings["b"] = createMessage("b", "a", "c");
  mappings["c"] = createMessage("c", "b", undefined);
  return mappings;
}

describe("getConversation", () => {
  let mappings: Record<string, ChatMessage>;

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

  test("returns empty if root id not in mappings", () => {
    expect(getConversation(mappings, "missing-root")).toEqual([]);
  });

  test("stops traversal when child pointer is missing in mappings", () => {
    // root -> a -> b -> c, but b.child points to missing node
    mappings["b"]!.child = "zzz";
    const convo = getConversation(mappings, "root");
    expect(convo.map((m) => m.id)).toEqual(["a", "b"]); // stops when it can't resolve zzz
  });
});

describe("getChildren", () => {
  let mappings: Record<string, ChatMessage>;

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

describe("nextChild", () => {
  let mappings: Record<string, ChatMessage>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("switches active child pointer to next sibling", () => {
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "a"; // current = a

    nextChild(mappings, "root");

    expect(mappings["root"]!.child).toBe("x");
    expect(mappings["x"]!.parent).toBe("root");
  });

  test("warns if no child found for parent (current child pointer not in children)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings["root"]!.child = "not-a-real-child-id";

    nextChild(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns if no next child available (already at last sibling)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "x"; // last sibling (order depends on Object.values insertion)

    // Ensure insertion order makes 'x' last:
    // mappings was created root,a,b,c then we added x, so children of root are [a, x]
    nextChild(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("does nothing (and warns) if parent id missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    nextChild(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("lastChild", () => {
  let mappings: Record<string, ChatMessage>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("switches active child pointer to previous sibling", () => {
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "x"; // current = x (2nd)

    lastChild(mappings, "root");

    expect(mappings["root"]!.child).toBe("a");
    expect(mappings["a"]!.parent).toBe("root"); // should already be true, but asserts consistency
  });

  test("warns if no child found for parent (current child pointer not in children)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings["root"]!.child = "not-a-real-child-id";

    lastChild(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns if no previous child available (already at first sibling)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "a"; // first sibling

    lastChild(mappings, "root");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("does nothing (and warns) if parent id missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    lastChild(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("deleteNode", () => {
  let mappings: Record<string, ChatMessage>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("removes node and all descendants", () => {
    deleteNode(mappings, "a");

    expect(mappings["a"]).toBeUndefined();
    expect(mappings["b"]).toBeUndefined();
    expect(mappings["c"]).toBeUndefined();
    expect(mappings["root"]).toBeDefined();
  });

  test("removes only that subtree when parent has multiple children", () => {
    mappings["a2"] = createMessage("a2", "root");
    // give a2 a descendant too
    mappings["a2-child"] = createMessage("a2-child", "a2");

    deleteNode(mappings, "a2");

    expect(mappings["a2"]).toBeUndefined();
    expect(mappings["a2-child"]).toBeUndefined();

    // original chain intact
    expect(mappings["a"]).toBeDefined();
    expect(mappings["b"]).toBeDefined();
    expect(mappings["c"]).toBeDefined();
  });

  test("warns for missing node", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    deleteNode(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("makeRoot", () => {
  let mappings: Record<string, ChatMessage>;

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("detaches node from parent and child and sets root=id", () => {
    makeRoot(mappings, "b");

    expect(mappings["b"]!.parent).toBeUndefined();
    expect(mappings["b"]!.child).toBeUndefined();
    expect(mappings["b"]!.root).toBe("b");

    expect(mappings["a"]!.child).toBeUndefined();
    expect(mappings["c"]!.parent).toBeUndefined();
  });

  test("if node already has no parent/child, just sets root=id", () => {
    mappings["solo"] = createMessage("solo", undefined, undefined);
    mappings["solo"]!.root = "root";

    makeRoot(mappings, "solo");

    expect(mappings["solo"]!.root).toBe("solo");
    expect(mappings["solo"]!.parent).toBeUndefined();
    expect(mappings["solo"]!.child).toBeUndefined();
  });

  test("warns if node missing", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    makeRoot(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("addNode", () => {
  let mappings: Record<string, ChatMessage>;

  const d1 = new Date("2020-01-01T00:00:00.000Z");
  const d2 = new Date("2020-01-02T00:00:00.000Z");

  beforeEach(() => {
    mappings = makeLinearMappings();
  });

  test("inserts new node and links parent", () => {
    addNode(mappings, "new", "assistant", "hi", "root", "c", undefined);

    expect(mappings["new"]).toBeDefined();
    expect(mappings["c"]!.child).toBe("new");
    expect(mappings["new"]!.parent).toBe("c");
  });

  test("warns if ID already exists", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    addNode(mappings, "a", "assistant", "dup", "root", undefined, undefined);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("creates a root node when root is undefined (root becomes id)", () => {
    addNode(mappings, "r2", "user", "hello", undefined, undefined, undefined, d1, d2);

    expect(mappings["r2"]).toBeDefined();
    expect(mappings["r2"]!.root).toBe("r2");
    expect(mappings["r2"]!.parent).toBeUndefined();
    expect(mappings["r2"]!.child).toBeUndefined();
  });

  test("creates a root node when parent is undefined even if root provided (root becomes id)", () => {
    addNode(mappings, "orphan", "user", "x", "root", undefined, undefined, d1, d2);

    expect(mappings["orphan"]!.root).toBe("orphan"); // because !root || !parent => root=id
    expect(mappings["orphan"]!.parent).toBeUndefined();
  });

  test("creates a non-root node when both root and parent are provided", () => {
    addNode(mappings, "d", "assistant", "hey", "root", "c", undefined, d1, d2);

    expect(mappings["d"]!.root).toBe("root");
    expect(mappings["d"]!.parent).toBe("c");
    expect(mappings["c"]!.child).toBe("d");
  });

  test("links provided child back to new node (sets child's parent)", () => {
    addNode(mappings, "x", "assistant", "mid", "root", "b", "c", d1, d2);

    expect(mappings["x"]!.parent).toBe("b");
    expect(mappings["x"]!.child).toBe("c");
    expect(mappings["b"]!.child).toBe("x");
    expect(mappings["c"]!.parent).toBe("x");
  });

  test("warns and does nothing if root does not exist", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    addNode(mappings, "x", "user", "badroot", "missing-root", "root", undefined);
    expect(warnSpy).toHaveBeenCalled();
    expect(mappings["x"]).toBeUndefined();
    warnSpy.mockRestore();
  });

  test("warns and does nothing if parent does not exist", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    addNode(mappings, "x", "user", "badparent", "root", "missing-parent", undefined);
    expect(warnSpy).toHaveBeenCalled();
    expect(mappings["x"]).toBeUndefined();
    warnSpy.mockRestore();
  });

  test("warns and does nothing if child does not exist (BUT parent.child is already set)", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    addNode(mappings, "x", "user", "badchild", "root", "b", "missing-child");

    expect(warnSpy).toHaveBeenCalled();
    expect(mappings["x"]).toBeUndefined();
    expect(mappings["b"]!.child).toBe("x"); // codifies current behavior

    warnSpy.mockRestore();
  });

  test("persists createTime and updateTime parameters", () => {
    addNode(mappings, "t", "assistant", "time", "root", "c", undefined, d1, d2);
    expect(mappings["t"]!.createTime).toBe(d1);
    expect(mappings["t"]!.updateTime).toBe(d2);
  });

  test("root auto-set happens when parent missing even if child is provided", () => {
    addNode(mappings, "solo", "user", "s", "root", undefined, "a", d1, d2);

    expect(mappings["solo"]!.root).toBe("solo");
    expect(mappings["a"]!.parent).toBe("solo");
  });

  test("sets parent.child to new node even if parent already had a child (overwrites)", () => {
    addNode(mappings, "newFirst", "user", "n", "root", "root", undefined);

    expect(mappings["root"]!.child).toBe("newFirst");
    expect(mappings["newFirst"]!.parent).toBe("root");
  });
});
