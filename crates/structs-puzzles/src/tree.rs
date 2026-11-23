//! BST and AVL insertion shared by the tree templates.
//!
//! Both follow the tree visualisers' inserts (`GraphicalBST.ts` and
//! `GraphicalAVL.ts`): walk down from the root, comparing the key with each
//! existing node, stop on a duplicate, and otherwise add a leaf. The AVL
//! insert then rebalances each node on the way back up, where a node's
//! balance is `height(left) - height(right)` and an empty subtree has height
//! 0:
//!
//! - Balance above 1: when the key went right of the left child (LR), rotate
//!   the left child left first; then rotate the node right.
//! - Balance below -1: when the key went left of the right child (RL), rotate
//!   the right child right first; then rotate the node left.
//!
//! A duplicate changes nothing, so no node above it is rebalanced.

/// One recorded event while inserting keys into a tree.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Event {
    /// `key` was compared with the existing node `existing` on its way down.
    Visit { key: i32, existing: i32 },
    /// `key` was added as a new leaf.
    Insert { key: i32 },
    /// A left rotation of the subtree whose root was `pivot`.
    RotateLeft { pivot: i32 },
    /// A right rotation of the subtree whose root was `pivot`.
    RotateRight { pivot: i32 },
}

type Link = Option<Box<Node>>;

/// A tree node, with the height of the subtree it roots (a leaf has height 1).
pub(crate) struct Node {
    value: i32,
    height: u32,
    left: Link,
    right: Link,
}

impl Node {
    fn leaf(value: i32) -> Box<Self> {
        Box::new(Self {
            value,
            height: 1,
            left: None,
            right: None,
        })
    }

    fn update_height(&mut self) {
        self.height = height(&self.left).max(height(&self.right)) + 1;
    }

    fn balance(&self) -> i64 {
        i64::from(height(&self.left)) - i64::from(height(&self.right))
    }
}

fn height(link: &Link) -> u32 {
    link.as_ref().map_or(0, |node| node.height)
}

/// Inserts `keys` in order into an empty plain BST, logging to `events`, and
/// returns the tree.
pub(crate) fn build_bst(keys: &[i32], events: &mut Vec<Event>) -> Option<Box<Node>> {
    let mut root = None;
    for &key in keys {
        bst_insert(&mut root, key, events);
    }
    root
}

/// Inserts `keys` in order into an empty AVL tree, logging to `events`.
pub(crate) fn build_avl(keys: &[i32], events: &mut Vec<Event>) {
    let mut root = None;
    for &key in keys {
        avl_insert(&mut root, key, events);
    }
}

/// The tree's values in preorder (node, left subtree, right subtree).
pub(crate) fn preorder(root: &Option<Box<Node>>) -> Vec<i32> {
    let mut out = Vec::new();
    let mut stack: Vec<&Node> = root.as_deref().into_iter().collect();
    while let Some(node) = stack.pop() {
        out.push(node.value);
        stack.extend(node.right.as_deref());
        stack.extend(node.left.as_deref());
    }
    out
}

fn bst_insert(slot: &mut Link, key: i32, events: &mut Vec<Event>) {
    let Some(node) = slot else {
        events.push(Event::Insert { key });
        *slot = Some(Node::leaf(key));
        return;
    };
    events.push(Event::Visit {
        key,
        existing: node.value,
    });
    if key < node.value {
        bst_insert(&mut node.left, key, events);
    } else if key > node.value {
        bst_insert(&mut node.right, key, events);
    }
}

/// Returns whether `key` was added, so a duplicate skips rebalancing.
fn avl_insert(slot: &mut Link, key: i32, events: &mut Vec<Event>) -> bool {
    let Some(node) = slot else {
        events.push(Event::Insert { key });
        *slot = Some(Node::leaf(key));
        return true;
    };
    events.push(Event::Visit {
        key,
        existing: node.value,
    });
    let inserted = if key < node.value {
        avl_insert(&mut node.left, key, events)
    } else if key > node.value {
        avl_insert(&mut node.right, key, events)
    } else {
        false
    };
    if !inserted {
        return false;
    }
    node.update_height();
    let balance = node.balance();
    if balance > 1 {
        if node.left.as_ref().is_some_and(|left| key > left.value) {
            rotate_left(&mut node.left, events);
        }
        rotate_right(slot, events);
    } else if balance < -1 {
        if node.right.as_ref().is_some_and(|right| key < right.value) {
            rotate_right(&mut node.right, events);
        }
        rotate_left(slot, events);
    }
    true
}

fn rotate_left(slot: &mut Link, events: &mut Vec<Event>) {
    let Some(mut node) = slot.take() else {
        return;
    };
    let Some(mut new_root) = node.right.take() else {
        *slot = Some(node);
        return;
    };
    events.push(Event::RotateLeft { pivot: node.value });
    node.right = new_root.left.take();
    node.update_height();
    new_root.left = Some(node);
    new_root.update_height();
    *slot = Some(new_root);
}

fn rotate_right(slot: &mut Link, events: &mut Vec<Event>) {
    let Some(mut node) = slot.take() else {
        return;
    };
    let Some(mut new_root) = node.left.take() else {
        *slot = Some(node);
        return;
    };
    events.push(Event::RotateRight { pivot: node.value });
    node.left = new_root.right.take();
    node.update_height();
    new_root.right = Some(node);
    new_root.update_height();
    *slot = Some(new_root);
}
