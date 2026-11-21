#include <stdio.h>

int square(int x) {
    int result = x * x;
    return result;
}

int main(void) {
    int a = 3;
    int b = 4;
    int c = square(a) + square(b);
    printf("%d\n", c);
    if (square(c) > 100) {
        printf("big\n");
    }
    return 0;
}
