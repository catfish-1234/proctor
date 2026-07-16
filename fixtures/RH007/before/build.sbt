name := "calculator"

lazy val root = (project in file("."))
  .settings(
    libraryDependencies += "org.scalatest" %% "scalatest" % "3.2.17" % Test
  )
