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

describe("Chat tree utilities", () => {
  let mappings: Record<string, ChatMessage>;

  beforeEach(() => {
    mappings = {};

    // root -> a -> b -> c
    mappings["root"] = createMessage("root", undefined, "a");
    mappings["a"] = createMessage("a", "root", "b");
    mappings["b"] = createMessage("b", "a", "c");
    mappings["c"] = createMessage("c", "b", undefined);
  });

  test("getConversation returns linear thread from root", () => {
    const convo = getConversation(mappings, "root");
    expect(convo.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  test("getConversation returns empty if root has no child", () => {
    mappings["loner"] = createMessage("loner");
    expect(getConversation(mappings, "loner")).toEqual([]);
  });

  test("getChildren returns all direct children", () => {
    mappings["a2"] = createMessage("a2", "a");
    const children = getChildren(mappings, "a");
    expect(children.map((c) => c.id).sort()).toEqual(["a2", "b"]);
  });

  test("nextChild switches active child pointer", () => {
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "a"; // current = a

    nextChild(mappings, "root");

    expect(mappings["root"]!.child).toBe("x");
    expect(mappings["x"]!.parent).toBe("root");
  });

  test("lastChild switches back to previous child", () => {
    mappings["x"] = createMessage("x", "root");
    mappings["root"]!.child = "x"; // currently last

    lastChild(mappings, "root");

    expect(mappings["root"]!.child).toBe("a");
  });

  test("nextChild warns if no next child", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    nextChild(mappings, "b"); // only one child "c"
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("deleteNode removes node and all descendants", () => {
    deleteNode(mappings, "a");

    expect(mappings["a"]).toBeUndefined();
    expect(mappings["b"]).toBeUndefined();
    expect(mappings["c"]).toBeUndefined();
    expect(mappings["root"]).toBeDefined();
  });

  test("deleteNode warns for missing node", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    deleteNode(mappings, "ghost");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("makeRoot detaches node from parent and child", () => {
    makeRoot(mappings, "b");

    expect(mappings["b"]!.parent).toBeUndefined();
    expect(mappings["b"]!.child).toBeUndefined();
    expect(mappings["b"]!.root).toBe("b");

    expect(mappings["a"]!.child).toBeUndefined();
    expect(mappings["c"]!.parent).toBeUndefined();
  });

  test("makeRoot warns if node missing", () => {
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

  beforeEach(() => {
    mappings = {};
    // root -> a -> b -> c
    mappings["root"] = createMessage("root", undefined, "a");
    mappings["a"] = createMessage("a", "root", "b");
    mappings["b"] = createMessage("b", "a", "c");
    mappings["c"] = createMessage("c", "b", undefined);
  });

  test("addNode inserts new node and links parent", () => {
    addNode(mappings, "new", "assistant", "hi", "root", "c", undefined);

    expect(mappings["new"]).toBeDefined();
    expect(mappings["c"]!.child).toBe("new");
    expect(mappings["new"]!.parent).toBe("c");
  });

  test("addNode warns if ID already exists", () => {
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
    expect(mappings["c"]!.child).toBe("d"); // parent gets linked
  });

  test("links provided child back to new node (sets child's parent)", () => {
    // Insert "x" before "c" by making x's child be c
    addNode(mappings, "x", "assistant", "mid", "root", "b", "c", d1, d2);

    expect(mappings["x"]!.parent).toBe("b");
    expect(mappings["x"]!.child).toBe("c");
    expect(mappings["b"]!.child).toBe("x");   // parent->child updated
    expect(mappings["c"]!.parent).toBe("x");  // child->parent updated
  });

  test("warns and does nothing if id already exists", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    addNode(mappings, "a", "user", "dup", "root", "root", undefined);

    expect(warnSpy).toHaveBeenCalled();
    // no changes: still points root -> a
    expect(mappings["root"]!.child).toBe("a");
    warnSpy.mockRestore();
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

  test("warns and does nothing if child does not exist", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    addNode(mappings, "x", "user", "badchild", "root", "b", "missing-child");

    expect(warnSpy).toHaveBeenCalled();
    expect(mappings["x"]).toBeUndefined();

    // IMPORTANT: parent.child was set before the child check, and should remain changed
    // (this test codifies current behavior—if you consider that a bug, we can change the implementation)
    expect(mappings["b"]!.child).toBe("x");

    warnSpy.mockRestore();
  });

  test("persists createTime and updateTime parameters", () => {
    addNode(mappings, "t", "assistant", "time", "root", "c", undefined, d1, d2);

    expect(mappings["t"]!.createTime).toBe(d1);
    expect(mappings["t"]!.updateTime).toBe(d2);
  });

  test("does not mutate provided root when both root+parent exist (root remains provided root)", () => {
    addNode(mappings, "z", "user", "ok", "root", "a", undefined);
    expect(mappings["z"]!.root).toBe("root");
  });

  test("root auto-set happens when parent missing even if child is provided", () => {
    // child exists, parent missing => treated as root
    addNode(mappings, "solo", "user", "s", "root", undefined, "a", d1, d2);

    expect(mappings["solo"]!.root).toBe("solo");
    expect(mappings["a"]!.parent).toBe("solo"); // child relink still happens
  });

  test("sets parent.child to new node even if parent already had a child (overwrites)", () => {
    // root currently points to "a"
    addNode(mappings, "newFirst", "user", "n", "root", "root", undefined);

    expect(mappings["root"]!.child).toBe("newFirst");
    expect(mappings["newFirst"]!.parent).toBe("root");
  });
});
