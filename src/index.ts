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
  const conversation: Array<ChatMessage<T>> = [];
    
  if (mappings[root] && mappings[root].child) {
    let current: ChatMessage<T> | undefined = mappings[mappings[root].child];
    while (current) {
      conversation.push(current);
      if (current.child) {
        current = mappings[current.child];
      } else {
        break;
      }
    }
  } else {
    console.warn(`Root message with ID: ${root} does not exist or has no child.`);
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
  const ancestors: Array<ChatMessage<T>> = [];
  
  if (mappings[id] && mappings[id].parent) {
    let current = mappings[id];
    while (current.parent && mappings[current.parent]) {
      ancestors.push(current);
      if (current.parent) {
        current = mappings[current.parent]!;
      } else {
        break;
      }
    }
  } else {
    console.warn(`Message with ID: ${id} does not exist or has no parent.`);
  }

  return ancestors;
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
  const children = getChildren(mappings, parent);
  const childIndex = children.findIndex((child) => child.id === mappings[parent]?.child);

  if (childIndex === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return;
  }

  if (childIndex + 1 >= children.length) {
    console.warn(`No next child available for parent ID: ${parent}`);
    return;
  }

  mappings[parent]!.child = children[childIndex + 1]!.id;
  children[childIndex + 1]!.parent = parent;
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
  const children = getChildren(mappings, parent);
  const childIndex = children.findIndex((child) => child.id === mappings[parent]?.child);

  if (childIndex === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return;
  }

  if (childIndex - 1 < 0) {
    console.warn(`No previous child available for parent ID: ${parent}`);
    return;
  }

  mappings[parent]!.child = children[childIndex - 1]!.id;
  children[childIndex - 1]!.parent = parent;
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
export function deleteNode<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string
): void {
  if (!mappings[id]) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return;
  }

  const children = getChildren<T>(mappings, id);

  for (const child of children) {
    deleteNode<T>(mappings, child.id);
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
  if (mappings[id]) {
    console.warn(`Node with ID: ${id} already exists.`);
    return;
  }

  if (root && !mappings[root]) {
    console.warn(`Root node with ID: ${root} does not exist.`);
    return;
  }

  if (parent) {
    if (mappings[parent]) {
      mappings[parent]!.child = id;
    } 
    else {
      console.warn(`Parent node with ID: ${parent} does not exist.`);
      return;
    }
  }
  
  if (!root || !parent) {
    // Must be a root
    root = id;
  }

  if (child) {
    if (mappings[child]) {
      mappings[child]!.parent = id;
    } 
    else {
      console.warn(`Child node with ID: ${child} does not exist.`);
      return;
    }
  }

  mappings[id] = {
    id,
    role,
    content,
    root,
    parent,
    child,
    createTime,
    updateTime
  };
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
  if (!mappings[id]) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return;
  }

  const node = mappings[id]!;
  
  // Remove parent-child relationships
  if (node.parent) {
    const parentNode = mappings[node.parent];
    if (parentNode) {
      parentNode.child = undefined;
    }
    node.parent = undefined;
  }

  if (node.child) {
    const childNode = mappings[node.child];
    if (childNode) {
      childNode.parent = undefined;
    }
    node.child = undefined;
  }

  // Set root to its own ID
  node.root = id;
}