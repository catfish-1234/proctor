using Xunit;

public class CalculatorTests
{
    [Fact]
    public void AddsTwoNumbers()
    {
        Assert.Equal(3, Calculator.Add(1, 2));
    }
}
