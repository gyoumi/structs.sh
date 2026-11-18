#include <stdio.h>

int main(void) {
    int total = 0;
    int value;
    while (scanf("%d", &value) == 1) {
        total += value;
    }
    printf("total %d\n", total);
    return 0;
}
