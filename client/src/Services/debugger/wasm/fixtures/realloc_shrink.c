#include <stdlib.h>

struct node {
    int value;
    struct node *next;
};

int main(void) {
    struct node *nodes = malloc(4 * sizeof(struct node));
    for (int i = 0; i < 4; i++) {
        nodes[i].value = i + 1;
        nodes[i].next = NULL;
    }
    struct node *last = &nodes[3];
    last = NULL;
    struct node *shrunk = realloc(nodes, sizeof(struct node));
    int *numbers = malloc(4 * sizeof(int));
    for (int i = 0; i < 4; i++) {
        numbers[i] = 1000 + i;
    }
    int done = 1;
    return done - 1;
}
