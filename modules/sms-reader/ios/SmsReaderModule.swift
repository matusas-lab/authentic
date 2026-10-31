import ExpoModulesCore

public class SmsReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SmsReader")

    Constant("PI") {
      Double.pi
    }

    Function("hello") {
      return "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { (value: String) in
    }
  }
}
