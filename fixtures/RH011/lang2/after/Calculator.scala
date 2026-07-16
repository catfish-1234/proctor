def add(a: Int, b: Int): Int = {
  @nowarn("cat=deprecation")
  a + b
}

def subtract(a: Int, b: Int): Int = {
  @nowarn("cat=deprecation")
  a - b
}
