Imports NUnit.Framework

<TestFixture>
Public Class CalculatorTests

    <Test>
    Public Sub Adds()
        Assert.AreEqual(3, Calculator.Add(1, 2))
    End Sub

End Class
