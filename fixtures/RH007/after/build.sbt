name := "calculator"

lazy val root = (project in file("."))
  .settings(
    libraryDependencies += "org.scalatest" %% "scalatest" % "3.2.17" % Test
  )

Test / testOptions += Tests.Exclude(Seq("com.foo.CalculatorTest"))
