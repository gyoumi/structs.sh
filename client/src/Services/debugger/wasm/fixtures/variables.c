#include <stdlib.h>
struct node {
    int value;
    struct node *next;
};
typedef struct node Node;
double scale = 1.5;
int sum(int *xs, int n) {
    int total = 0;
    for (int i = 0; i < n; i++) {
        total += xs[i];
    }
    return total;
}
int main(void) {
    int nums[3] = {1, 2, 3};
    char c = 'x';
    double d = 2.5;
    float f = 0.5f;
    char *s = "hi";
    struct node n = {7, NULL};
    Node *p = &n;
    int t = sum(nums, 3);
    return t + c + (int)d + (int)f + s[0] + p->value;
}
