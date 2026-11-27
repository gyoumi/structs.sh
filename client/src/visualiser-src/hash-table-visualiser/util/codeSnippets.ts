export const insertCodeSnippet = `void insert(HashTable ht, int key) {
    int start = key % ht->size;
    int target = -1;
    for (int i = 0; i < ht->size; i++) {
        int idx = (start + i) % ht->size;
        if (ht->state[idx] == OCCUPIED && ht->keys[idx] == key) {
            return;
        }
        if (ht->state[idx] == DELETED && target == -1) {
            target = idx;
        }
        if (ht->state[idx] == EMPTY) {
            if (target == -1) target = idx;
            break;
        }
    }
    if (target == -1) {
        printf("Table is full\\n");
        return;
    }
    ht->keys[target] = key;
    ht->state[target] = OCCUPIED;
}`;

export const searchCodeSnippet = `bool search(HashTable ht, int key) {
    int start = key % ht->size;
    for (int i = 0; i < ht->size; i++) {
        int idx = (start + i) % ht->size;
        if (ht->state[idx] == EMPTY) {
            return false;
        }
        if (ht->state[idx] == OCCUPIED && ht->keys[idx] == key) {
            return true;
        }
    }
    return false;
}`;

export const deleteCodeSnippet = `void delete(HashTable ht, int key) {
    int start = key % ht->size;
    for (int i = 0; i < ht->size; i++) {
        int idx = (start + i) % ht->size;
        if (ht->state[idx] == EMPTY) {
            return;
        }
        if (ht->state[idx] == OCCUPIED && ht->keys[idx] == key) {
            ht->state[idx] = DELETED;
            return;
        }
    }
    printf("Not found\\n");
}`;
