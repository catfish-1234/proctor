Imports Microsoft.VisualStudio.TestTools.UnitTesting

<TestClass>
Public Class CalculatorTests

    <TestMethod>
    Public Sub AddsTwoNumbers()
        Dim result As Integer = Calculator.Add(1, 2)
        Assert.AreEqual(3, result)
    End Sub

End Class
