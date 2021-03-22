#include <iostream>

int main(void) {
  long long sum = 0;
  for (long long i = 0; i < 1000'000'000; ++i) {
    sum ^= i;
  }
  std::cout << sum << "\n";
  return 0;
}