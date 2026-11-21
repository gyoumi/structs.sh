#include <stdint.h>
#include <stdlib.h>

struct node {
    int value;
    struct node *next;
};

struct triple {
    int a;
    int b;
    int c;
};

int main(void) {
    char *pool = malloc(64);
    int *words = malloc(2 * sizeof(int));
    words[0] = 777;
    words[1] = 0;
    struct node *n = (struct node *)(pool + 8);
    n->value = 1;
    n->next = NULL;
    n = NULL;
    struct triple *t = (struct triple *)(pool + 4);
    t->a = 5;
    t->b = 6;
    t->c = (int)(intptr_t)words;
    int done = 1;
    return done - 1;
}
