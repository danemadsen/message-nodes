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
