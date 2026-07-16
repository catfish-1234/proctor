Public Class Calculator
    Public Shared Function Add(a As Integer, b As Integer) As Integer
#Disable Warning CA1234
        Return a + b
    End Function

    Public Shared Function Subtract(a As Integer, b As Integer) As Integer
#Disable Warning CA1234
        Return a - b
    End Function
End Class
