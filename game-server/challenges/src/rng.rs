//! A small deterministic PRNG (SplitMix64), so challenge generation and search
//! need no extra crates.

/// SplitMix64 generator: the same seed always yields the same sequence.
pub(crate) struct Rng(u64);

impl Rng {
    pub(crate) fn new(seed: u64) -> Self {
        Self(seed)
    }

    pub(crate) fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A uniformly chosen value in `0..n`, or 0 when `n` is 0.
    pub(crate) fn gen_range(&mut self, n: usize) -> usize {
        if n == 0 {
            return 0;
        }
        let bound = n as u64;
        let threshold = bound.wrapping_neg() % bound;
        loop {
            let value = self.next_u64();
            if value >= threshold {
                return (value % bound) as usize;
            }
        }
    }

    /// Fisher-Yates shuffle of `items`.
    pub(crate) fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.gen_range(i + 1);
            items.swap(i, j);
        }
    }

    /// `k` distinct indices in `0..n` (all of them when `k >= n`), sorted.
    pub(crate) fn sample_indices(&mut self, n: usize, k: usize) -> Vec<usize> {
        let mut all: Vec<usize> = (0..n).collect();
        self.shuffle(&mut all);
        all.truncate(k);
        all.sort_unstable();
        all
    }
}
