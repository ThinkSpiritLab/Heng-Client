#include <bits/stdc++.h>

using namespace std;

int main() {
  FILE *f = fdopen(3, "r");
  FILE *d = fdopen(4, "r");

  int a, b;

  fscanf(f, "%d", &a);
  fscanf(d, "%d", &b);

  int x, y;
  scanf("%d%d", &x, &y);
  if (x + y + a == b)
    std::cout << "AC";
  else
    std::cout << "WA";
  return 0;
}