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

int main(void) {
    struct node *list = NULL;
    list = prepend(list, 3);
    list = prepend(list, 2);
    list = prepend(list, 1);
    int done = 1;
    return done == 1 ? 0 : 1;
}
