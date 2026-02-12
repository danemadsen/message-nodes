/**
 * Represents a message node in a conversation thread, containing information about the message's ID, role, content, and relationships to other messages.
 */
export interface MessageNode<T = string> {
  id: string;
  role: string;
  content: T;
  root: string;
  parent?: string | undefined;
  child?: string | undefined; 
  createTime: Date;
  updateTime: Date;
}

function cloneNode<T>(node: MessageNode<T>): MessageNode<T> {
  return { ...node };
}

function updateMap<T>(
  mappings: Readonly<Record<string, MessageNode<T>>>,
  fn: (draft: Record<string, MessageNode<T>>) => void
): Record<string, MessageNode<T>> {
  // shallow clone the map, then let fn mutate the clone
  const next: Record<string, MessageNode<T>> = { ...(mappings as any) };
  fn(next);
  return next;
}

/**
 * Checks if a node exists in the mappings.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to check.
 * @returns True if the node exists, false otherwise.
 */
export function hasNode<T = string>(
  mappings: Record<string, MessageNode<T>>, 
  id: string
): boolean {
  return !!mappings[id];
}

/**
 * Retrieves a node from the mappings by its ID.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to retrieve.
 * @returns The MessageNode object if found, or undefined if not found.
 */
export function getNode<T = string>(
  mappings: Record<string, MessageNode<T>>, 
  id: string
): MessageNode<T> | undefined {
  return mappings[id];
}

/**
 * Retrieves the root node of a conversation thread given any node ID.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to start from.
 * @returns The root MessageNode object if found, or undefined if not found.
 */
export function getRoot<T = string>(
  mappings: Record<string, MessageNode<T>>, 
  id: string
): MessageNode<T> | undefined {
  let current = mappings[id];
  if (!current) return undefined;

  while (current.parent && mappings[current.parent]) {
    current = mappings[current.parent]!;
  }

  return current;
}

/**
 * Retrieves all root nodes in the mappings.
 * Root nodes are any nodes where node.root === node.id.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @returns An array of MessageNode objects that are roots.
 */
export function getRoots<T = string>(
  mappings: Record<string, MessageNode<T>>
): Array<MessageNode<T>> {
  return Object.values(mappings).filter((node) => node.root === node.id);
}

/**
 * Retrieves the conversation thread starting from the root message.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param root The ID of the root message to start from.
 * @returns An array of MessageNode objects representing the conversation thread.
 */
export function getConversation<T = string>(
  mappings: Record<string, MessageNode<T>>,
  root: string
): Array<MessageNode<T>> {
  const rootNode = getNode(mappings, root);
  if (!rootNode) {
    console.warn(`Root message with ID: ${root} does not exist.`);
    return [];
  }

  if (!rootNode.child) return [];

  const conversation: Array<MessageNode<T>> = [];
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
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param id The ID of the message to start from.
 * @returns An array of MessageNode objects representing the ancestors of the specified message ID.
 */
export function getAncestry<T = string>(
  mappings: Record<string, MessageNode<T>>,
  id: string
): Array<MessageNode<T>> {
  const start = getNode(mappings, id);
  if (!start) {
    console.warn(`Message with ID: ${id} does not exist.`);
    return [];
  }

  const out: Array<MessageNode<T>> = [];
  const seen = new Set<string>();

  let current: MessageNode<T> | undefined = start;
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
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param id The ID of the parent message.
 * @returns An array of MessageNode objects that are direct children of the specified message ID.
 */
export function getChildren<T = string>(
  mappings: Record<string, MessageNode<T>>, 
  id: string
): Array<MessageNode<T>> {
  return Object.values(mappings).filter((msg) => msg.parent === id);
}

/**
 * Moves to the next child message of a given parent message.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param parent The ID of the parent message.
 * @returns A new mappings object (or the original if no change).
 */
export function nextChild<T = string>(
  mappings: Readonly<Record<string, MessageNode<T>>>,
  parent: string
): Record<string, MessageNode<T>> {
  const parentNode = mappings[parent];
  if (!parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return mappings as Record<string, MessageNode<T>>;
  }

  const children = getChildren(mappings as any, parent);
  const idx = children.findIndex((c) => c.id === parentNode.child);

  if (idx === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return mappings as Record<string, MessageNode<T>>;
  }
  if (idx + 1 >= children.length) {
    console.warn(`No next child available for parent ID: ${parent}`);
    return mappings as Record<string, MessageNode<T>>;
  }

  return setChild(mappings, parent, children[idx + 1]!.id);
}

/**
 * Moves to the previous child message of a given parent message.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param parent The ID of the parent message.
 * @returns A new mappings object (or the original if no change).
 */
export function lastChild<T = string>(
  mappings: Readonly<Record<string, MessageNode<T>>>,
  parent: string
): Record<string, MessageNode<T>> {
  const parentNode = mappings[parent];
  if (!parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return mappings as Record<string, MessageNode<T>>;
  }

  const children = getChildren(mappings as any, parent);
  const idx = children.findIndex((c) => c.id === parentNode.child);

  if (idx === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return mappings as Record<string, MessageNode<T>>;
  }
  if (idx - 1 < 0) {
    console.warn(`No previous child available for parent ID: ${parent}`);
    return mappings as Record<string, MessageNode<T>>;
  }

  return setChild(mappings, parent, children[idx - 1]!.id);
}

/**
 * Sets the child of a parent message to a specified child message, ensuring that the parent-child relationship is valid.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param parent The ID of the parent message.
 * @param child The ID of the child message to set.
 * @returns A new mappings object (or the original if no change).
 */
export function setChild<T = string>(
  mappings: Readonly<Record<string, MessageNode<T>>>,
  parent: string,
  child: string | undefined
): Record<string, MessageNode<T>> {
  const p0 = mappings[parent];
  if (!p0) return mappings as Record<string, MessageNode<T>>;

  if (child !== undefined) {
    const c0 = mappings[child];
    if (!c0 || c0.parent !== parent) return mappings as Record<string, MessageNode<T>>;
  }

  // No-op guard (keeps referential equality if nothing changes)
  if (p0.child === child) return mappings as Record<string, MessageNode<T>>;

  return updateMap(mappings, (draft) => {
    // clone parent before mutation
    draft[parent] = cloneNode(draft[parent]!);
    draft[parent]!.child = child;
  });
}

/**
 * Deletes a node and all of its child nodes from the mappings.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the parent node.
 * @returns A new mappings object (or the original if no change).
 */
export function deleteNode<T>(
  mappings: Readonly<Record<string, MessageNode<T>>>,
  id: string
): Record<string, MessageNode<T>> {
  if (!mappings[id]) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return mappings as Record<string, MessageNode<T>>;
  }

  return updateMap(mappings, (draft) => {
    const seen = new Set<string>();
    _deleteNodeInternal(draft, id, seen);
  });
}

function _deleteNodeInternal<T>(
  draft: Record<string, MessageNode<T>>,
  id: string,
  seen: Set<string>
): void {
  const node = draft[id];
  if (!node) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return;
  }

  if (seen.has(id)) {
    console.warn(`Cycle detected while deleting at ID: ${id}`);
    return;
  }
  seen.add(id);

  const childIds = getChildren(draft as any, id).map((c) => c.id);

  for (const childId of childIds) {
    _deleteNodeInternal(draft, childId, seen);
  }

  const parentId = node.parent;
  if (parentId) {
    const parent = draft[parentId];
    if (parent?.child === id) {
      draft[parentId] = cloneNode(parent);
      draft[parentId]!.child = undefined;
    }
  }

  const activeChildId = node.child;
  if (activeChildId) {
    const activeChild = draft[activeChildId];
    if (activeChild?.parent === id) {
      draft[activeChildId] = cloneNode(activeChild);
      draft[activeChildId]!.parent = undefined;
    }
  }

  delete draft[id];
}

/**
 * Unlinks a node from its parent and child nodes, effectively isolating it in the conversation thread.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to unlink.
 * @returns A new mappings object (or the original if no change).
 */
export function unlinkNode<T = string>(
  mappings: Readonly<Record<string, MessageNode<T>>>,
  id: string
): Record<string, MessageNode<T>> {
  const node0 = mappings[id];
  if (!node0) return mappings as Record<string, MessageNode<T>>;

  // If it's already isolated, keep referential equality
  const already =
    node0.parent === undefined &&
    node0.child === undefined &&
    node0.root === id;

  if (already) return mappings as Record<string, MessageNode<T>>;

  return updateMap(mappings, (draft) => {
    const node = draft[id];
    if (!node) return;

    // parent side
    if (node.parent && draft[node.parent]) {
      const pId = node.parent;
      const p = draft[pId]!;
      if (p.child === id) {
        draft[pId] = cloneNode(p);
        draft[pId]!.child = undefined;
      }
    }

    // child side
    if (node.child && draft[node.child]) {
      const cId = node.child;
      const c = draft[cId]!;
      if (c.parent === id) {
        draft[cId] = cloneNode(c);
        draft[cId]!.parent = undefined;
      }
    }

    // isolate self
    draft[id] = cloneNode(node);
    draft[id]!.parent = undefined;
    draft[id]!.child = undefined;
    draft[id]!.root = id;
  });
}

/**
 * Adds a new node to the mappings with optional parent-child relationships.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @returns A new mappings object (or the original if no change).
 */
export function addNode<T = string>(
  mappings: Readonly<Record<string, MessageNode<T>>>,
  id: string,
  role: string,
  content: T,
  root: string | undefined,
  parent: string | undefined,
  child: string | undefined,
  createTime: Date = new Date(),
  updateTime: Date = new Date()
): Record<string, MessageNode<T>> {
  if (hasNode(mappings as any, id)) {
    console.warn(`Node with ID: ${id} already exists.`);
    return mappings as Record<string, MessageNode<T>>;
  }

  // Validate parent/child existence up-front (prevents partial mutation).
  const parentNode = parent ? (mappings as any)[parent] as MessageNode<T> | undefined : undefined;
  if (parent && !parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return mappings as Record<string, MessageNode<T>>;
  }

  const childNode = child ? (mappings as any)[child] as MessageNode<T> | undefined : undefined;
  if (child && !childNode) {
    console.warn(`Child node with ID: ${child} does not exist.`);
    return mappings as Record<string, MessageNode<T>>;
  }

  // Determine root
  if (!parent) {
    root = id;
  } else {
    root = getRoot(mappings as any, parent)?.id ?? parent;
  }

  if (root && !hasNode(mappings as any, root) && root !== id) {
    console.warn(`Root node with ID: ${root} does not exist.`);
    return mappings as Record<string, MessageNode<T>>;
  }

  return updateMap(mappings, (draft) => {
    // create node
    draft[id] = {
      id,
      role,
      content,
      root,
      parent,
      child,
      createTime,
      updateTime,
    };

    // link parent -> this (active child)
    if (parent) {
      const p = draft[parent];
      if (p) {
        draft[parent] = cloneNode(p);
        // keep the old invariant: only point to a child that claims this parent
        if (draft[id]!.parent === parent) {
          draft[parent]!.child = id;
        }
      }
    }

    // link child -> this (parent pointer)
    if (child) {
      const c = draft[child];
      if (c) {
        draft[child] = cloneNode(c);
        draft[child]!.parent = id;
      }
    }
  });
}

/**
 * Converts a node to a root node by setting its root property to its own ID and removing any parent-child relationships.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to convert to a root node.
 * @returns A new mappings object (or the original if no change).
 */
export function makeRoot<T = string>(
  mappings: Readonly<Record<string, MessageNode<T>>>,
  id: string
): Record<string, MessageNode<T>> {
  const node0 = mappings[id];
  if (!node0) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return mappings as Record<string, MessageNode<T>>;
  }

  const newRootId = id;

  return updateMap(mappings, (draft) => {
    const node = draft[id];
    if (!node) return;

    // Detach from parent (but keep child/subtree!)
    if (node.parent) {
      const pId = node.parent;
      const parent = draft[pId];
      if (parent?.child === id) {
        draft[pId] = cloneNode(parent);
        draft[pId]!.child = undefined;
      }

      draft[id] = cloneNode(draft[id]!);
      draft[id]!.parent = undefined;
    }

    // Rewrite root on this node + descendants (branch-aware)
    const seen = new Set<string>();
    const stack = [newRootId];

    while (stack.length) {
      const curId = stack.pop()!;
      if (seen.has(curId)) continue;
      seen.add(curId);

      const cur = draft[curId];
      if (!cur) continue;

      // clone before mutating root
      draft[curId] = cloneNode(cur);
      draft[curId]!.root = newRootId;

      // Follow explicit chain
      if (draft[curId]!.child) stack.push(draft[curId]!.child!);

      // Follow all direct children (branching)
      for (const ch of getChildren(draft as any, curId)) {
        stack.push(ch.id);
      }
    }
  });
}