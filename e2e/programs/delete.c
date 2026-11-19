#include <stdlib.h>

struct node {
    int value;
    struct node *next;
};

struct node *prepend(struct node *head, int value) {
    struct node *n = malloc(sizeof(struct node));
    n->value = value;
    n->next = head;
    return n;
}

struct node *delete_first(struct node *head) {
    struct node *rest = head->next;
    free(head);
    return rest;
}

struct node *reverse(struct node *head) {
    struct node *prev = NULL;
    while (head != NULL) {
        struct node *next = head->next;
        head->next = prev;
        prev = head;
        head = next;
    }
    return prev;
}

int main(void) {
    struct node *list = NULL;
    list = prepend(list, 3);
    list = prepend(list, 2);
    list = prepend(list, 1);
    list = reverse(list);
    list = delete_first(list);
    int done = 1;
    return done - 1;
}
