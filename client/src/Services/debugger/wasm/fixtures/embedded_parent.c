#include <stddef.h>
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
    char *raw = malloc(sizeof(struct box));
    struct inner *child = (struct inner *)(raw + offsetof(struct box, child));
    child->value = 70;
    child->weight = 700;
    child = NULL;
    struct box *box = (struct box *)raw;
    box->id = 7;
    box = NULL;
    int a = 1;
    int b = 2;
    return a + b - 3;
}
