#include <stdlib.h>

struct node {
    int value;
    struct node *next;
};

struct pair {
    int left;
    int right;
};

int main(void) {
    char *pool = malloc(64);
    struct node *n = (struct node *)pool;
    n->value = 1;
    n->next = NULL;
    n = NULL;
    int *words = (int *)pool;
    words[0] = 41;
    words[1] = 42;
    struct pair *p = (struct pair *)pool;
    p = NULL;
    int a = 1;
    int b = 2;
    int c = 3;
    return a + b + c - 6;
}
