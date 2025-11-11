import Foundation

enum Beacon {
    static func fire(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        let task = URLSession.shared.dataTask(with: req) { _,_,_ in }
        task.resume()
    }
}
