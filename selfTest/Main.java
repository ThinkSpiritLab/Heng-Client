public class Main{
    public static void main(String[] args) {
        long sum = 0;
        for(long i = 0;i<1000000000;++i)
        {
            sum = sum ^ i;
        }
        System.out.print(sum);
    }
}