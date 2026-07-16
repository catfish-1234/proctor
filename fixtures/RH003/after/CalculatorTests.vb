Imports Microsoft.VisualStudio.TestTools.UnitTesting

<TestClass>
Public Class CalculatorTests

    <Ignore>
    <TestMethod>
    Public Sub AddsTwoNumbers()
        Assert.AreEqual(3, Calculator.Add(1, 2))
    End Sub

End Class
