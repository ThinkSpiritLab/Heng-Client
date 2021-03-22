def main():
    sum = 0
    for i in range(10000000):
        sum = i ^ sum
    print(sum)

main()
