int square(int x) {
    int result = x * x;
    return result;
}

int main(void) {
    int a = 4;
    int b = square(a);
    return b == 16 ? 0 : 1;
}
