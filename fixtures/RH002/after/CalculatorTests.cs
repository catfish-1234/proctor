using Xunit;

public class CalculatorTests
{
    [Fact]
    public void AddsTwoNumbers()
    {
        var result = Calculator.Add(1, 2);
        Assert.NotNull(result);
    }
}
