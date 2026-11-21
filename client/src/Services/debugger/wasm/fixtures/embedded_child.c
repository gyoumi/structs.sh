#include <stdlib.h>

struct inner {
    int value;
    int weight;
};

struct box {
    int id;
    struct inner child;
};

int main(void) {
    struct box *box = malloc(sizeof(struct box));
    box->id = 7;
    box->child.value = 70;
    box->child.weight = 700;
    struct inner *child = &box->child;
    box = NULL;
    child->value = 71;
    int a = 1;
    int b = 2;
    return a + b - 3;
}
