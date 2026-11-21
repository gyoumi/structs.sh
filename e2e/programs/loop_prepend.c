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
    for (int i = 1; i <= 3; i++) list = prepend(list, i);
    struct node *other = prepend(prepend(NULL, 8), 9);
    int done = 1;
    return done - 1;
}
