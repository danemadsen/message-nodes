export interface ChatMessage<T = string> {
  id: string;
  role: string;
  content: T;
  root: string | undefined;
  parent?: string | undefined;
  child?: string | undefined; 
  createTime: Date;
  updateTime: Date;
}

/**
 * Checks if a node exists in the mappings.
 * @param mappings A record mapping node IDs to ChatMessage objects.
 * @param id The ID of the node to check.
 * @returns True if the node exists, false otherwise.
 */
export function hasNode<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string
): boolean {
  return !!mappings[id];
}

/**
 * Retrieves a node from the mappings by its ID.
 * @param mappings A record mapping node IDs to ChatMessage objects.
 * @param id The ID of the node to retrieve.
 * @returns The ChatMessage object if found, or undefined if not found.
 */
export function getNode<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string
): ChatMessage<T> | undefined {
  return mappings[id];
}

/**
 * Retrieves the root node of a conversation thread given any node ID.
 * @param mappings A record mapping node IDs to ChatMessage objects.
 * @param id The ID of the node to start from.
 * @returns The root ChatMessage object if found, or undefined if not found.
 */
export function getRoot<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string
): ChatMessage<T> | undefined {
  let current = mappings[id];
  if (!current) return undefined;

  while (current.parent && mappings[current.parent]) {
    current = mappings[current.parent]!;
  }

  return current;
}

/**
 * Retrieves the conversation thread starting from the root message.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param root The ID of the root message to start from.
 * @returns An array of ChatMessage objects representing the conversation thread.
 */
export function getConversation<T = string>(
  mappings: Record<string, ChatMessage<T>>,
  root: string
): Array<ChatMessage<T>> {
  const rootNode = getNode(mappings, root);
  if (!rootNode) {
    console.warn(`Root message with ID: ${root} does not exist.`);
    return [];
  }

  if (!rootNode.child) return [];

  const conversation: Array<ChatMessage<T>> = [];
  const seen = new Set<string>();

  let current = getNode(mappings, rootNode.child);

  while (current) {
    if (seen.has(current.id)) {
      console.warn(`Cycle detected in conversation at ID: ${current.id}`);
      break;
    }
    seen.add(current.id);

    conversation.push(current);
    current = current.child ? getNode(mappings, current.child) : undefined;
  }

  return conversation;
}

/**
 * Retrieves all ancestor messages of a given message ID.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param id The ID of the message to start from.
 * @returns An array of ChatMessage objects representing the ancestors of the specified message ID.
 */
export function getAncestry<T = string>(
  mappings: Record<string, ChatMessage<T>>,
  id: string
): Array<ChatMessage<T>> {
  const start = getNode(mappings, id);
  if (!start) {
    console.warn(`Message with ID: ${id} does not exist.`);
    return [];
  }

  const out: Array<ChatMessage<T>> = [];
  const seen = new Set<string>();

  let current: ChatMessage<T> | undefined = start;
  while (current) {
    if (seen.has(current.id)) {
      console.warn(`Cycle detected in ancestry at ID: ${current.id}`);
      break;
    }
    seen.add(current.id);

    out.push(current);
    current = current.parent ? getNode(mappings, current.parent) : undefined;
  }

  return out;
}

/**
 * Retrieves all direct child messages of a given message ID.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param id The ID of the parent message.
 * @returns An array of ChatMessage objects that are direct children of the specified message ID.
 */
export function getChildren<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string
): Array<ChatMessage<T>> {
  return Object.values(mappings).filter((msg) => msg.parent === id);
}

/**
 * Moves to the next child message of a given parent message.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param parent The ID of the parent message.
 */
export function nextChild<T = string>(
  mappings: Record<string, ChatMessage<T>>,
  parent: string
): void {
  const parentNode = getNode(mappings, parent);
  if (!parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return;
  }

  const children = getChildren(mappings, parent);
  const idx = children.findIndex((c) => c.id === parentNode?.child);

  if (idx === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return;
  }
  if (idx + 1 >= children.length) {
    console.warn(`No next child available for parent ID: ${parent}`);
    return;
  }

  setChild(mappings, parent, children[idx + 1]!.id);
}

/**
 * Moves to the previous child message of a given parent message.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param parent The ID of the parent message.
 */
export function lastChild<T = string>(
  mappings: Record<string, ChatMessage<T>>,
  parent: string
): void {
  const parentNode = getNode(mappings, parent);
  if (!parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return;
  }

  const children = getChildren(mappings, parent);
  const idx = children.findIndex((c) => c.id === parentNode.child);

  if (idx === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return;
  }
  if (idx - 1 < 0) {
    console.warn(`No previous child available for parent ID: ${parent}`);
    return;
  }

  setChild(mappings, parent, children[idx - 1]!.id);
}

/**
 * Sets the child of a parent message to a specified child message, ensuring that the parent-child relationship is valid.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param parent The ID of the parent message.
 * @param child The ID of the child message to set.
 */
export function setChild<T = string>(
  mappings: Record<string, ChatMessage<T>>,
  parent: string,
  child: string | undefined
): void {
  const p = mappings[parent];
  if (!p) return;
  if (child === undefined) { p.child = undefined; return; }
  if (!mappings[child] || mappings[child]!.parent !== parent) return; // or allow reparent
  p.child = child;
}

/**
 * Deletes a node and all of its child nodes from the mappings.
 * @param mappings A record mapping node IDs to ChatMessage objects.
 * @param id The ID of the parent node.
 */
export function deleteNode<T>(
  mappings: Record<string, ChatMessage<T>>,
  id: string
): void {
  const seen = new Set<string>();
  _deleteNodeInternal(mappings, id, seen);
}

function _deleteNodeInternal<T>(
  mappings: Record<string, ChatMessage<T>>,
  id: string,
  seen: Set<string>
): void {
  const node = getNode(mappings, id);
  if (!node) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return;
  }

  if (seen.has(id)) {
    console.warn(`Cycle detected while deleting at ID: ${id}`);
    return;
  }
  seen.add(id);

  unlinkNode(mappings, id);

  const children = getChildren(mappings, id);
  for (const child of children) {
    _deleteNodeInternal(mappings, child.id, seen);
  }

  delete mappings[id];
}

/**
 * Unlinks a node from its parent and child nodes, effectively isolating it in the conversation thread.
 * @param mappings A record mapping node IDs to ChatMessage objects.
 * @param id The ID of the node to unlink.
 */
export function unlinkNode<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string
): void {
  const node = mappings[id];
  if (!node) return;

  if (node.parent && mappings[node.parent]) {
    const p = mappings[node.parent]!;
    if (p.child === id) p.child = undefined;
  }
  if (node.child && mappings[node.child]) {
    const c = mappings[node.child]!;
    if (c.parent === id) c.parent = undefined;
  }

  node.parent = undefined;
  node.child = undefined;
  node.root = id;
}

/**
 * Adds a new node to the mappings with optional parent-child relationships.
 * @param mappings A record mapping node IDs to ChatMessage objects.
 * @param id The unique ID of the new node.
 * @param role The role associated with the node (e.g., "user", "assistant").
 * @param content The content of the node.
 * @param root The ID of the root node in the conversation thread (if applicable).
 * @param parent The ID of the parent node (if applicable).
 * @param child The ID of the child node (if applicable).
 * @param createTime The creation time of the node (defaults to current time).
 * @param updateTime The last update time of the node (defaults to current time).
 */
export function addNode<T = string>(
  mappings: Record<string, ChatMessage<T>>,
  id: string,
  role: string,
  content: T,
  root: string | undefined,
  parent: string | undefined,
  child: string | undefined,
  createTime: Date = new Date(),
  updateTime: Date = new Date()
): void {
  if (hasNode(mappings, id)) {
    console.warn(`Node with ID: ${id} already exists.`);
    return;
  }

  // Validate parent/child existence up-front (prevents partial mutation).
  const parentNode = parent ? getNode(mappings, parent) : undefined;
  if (parent && !parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return;
  }

  const childNode = child ? getNode(mappings, child) : undefined;
  if (child && !childNode) {
    console.warn(`Child node with ID: ${child} does not exist.`);
    return;
  }

  // Determine root:
  // - If parent exists, root should be parent's root (or actual root by walking up).
  // - If no parent, this node becomes a root regardless of provided root.
  if (!parent) {
    root = id;
  } else {
    root = getRoot(mappings, parent)?.id ?? parent; // fallback, should exist
  }

  // If the caller supplied a root, we can optionally sanity-check it:
  // (If you don't care, you can drop this block.)
  if (root && !hasNode(mappings, root) && root !== id) {
    console.warn(`Root node with ID: ${root} does not exist.`);
    return;
  }

  // Create node first
  mappings[id] = {
    id,
    role,
    content,
    root,
    parent,
    child,
    createTime,
    updateTime,
  };

  // Now apply linking
  if (parent) setChild(mappings, parent, id);
  if (child) childNode!.parent = id;
}

/**
 * Converts a node to a root node by setting its root property to its own ID and removing any parent-child relationships.
 * @param mappings A record mapping node IDs to ChatMessage objects.
 * @param id The ID of the node to convert to a root node.
 */
export function makeRoot<T = string>(
  mappings: Record<string, ChatMessage<T>>,
  id: string
): void {
  const node = getNode(mappings, id);
  if (!node) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return;
  }

  // Detach from parent (but keep child/subtree!)
  if (node.parent) {
    const parent = getNode(mappings, node.parent);
    if (parent?.child === id) parent.child = undefined;
    node.parent = undefined;
  }

  const newRootId = id;

  // Rewrite root on this node + descendants (branch-aware)
  const seen = new Set<string>();
  const stack = [newRootId];

  while (stack.length) {
    const curId = stack.pop()!;
    if (seen.has(curId)) continue;
    seen.add(curId);

    const cur = getNode(mappings, curId);
    if (!cur) continue;

    cur.root = newRootId;

    // Follow explicit chain
    if (cur.child) stack.push(cur.child);

    // Follow all direct children (branching)
    for (const ch of getChildren(mappings, curId)) stack.push(ch.id);
  }
}