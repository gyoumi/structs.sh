#include <stdlib.h>

struct node {
    int value;
    struct node *next;
};

struct node *new_node(int value) {
    struct node *n = malloc(sizeof(struct node));
    n->value = value;
    n->next = NULL;
    return n;
}

struct node *append(struct node *head, int value) {
    if (head == NULL) {
        return new_node(value);
    }
    struct node *curr = head;
    while (curr->next != NULL) {
        curr = curr->next;
    }
    curr->next = new_node(value);
    return head;
}

int main(void) {
    struct node *list = NULL;
    list = append(list, 1);
    list = append(list, 2);
    list = append(list, 3);
    return 0;
}
