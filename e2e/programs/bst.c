#include <stdlib.h>

struct node {
    int value;
    struct node *left;
    struct node *right;
};

struct node *insert(struct node *root, int value) {
    if (root == NULL) {
        struct node *n = malloc(sizeof(struct node));
        n->value = value;
        n->left = NULL;
        n->right = NULL;
        return n;
    }
    if (value < root->value) {
        root->left = insert(root->left, value);
    } else {
        root->right = insert(root->right, value);
    }
    return root;
}

int main(void) {
    struct node *tree = NULL;
    tree = insert(tree, 5);
    tree = insert(tree, 3);
    tree = insert(tree, 8);
    int done = 1;
    return done - 1;
}
