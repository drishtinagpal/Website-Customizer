import { useState } from "react";
import axios from "axios";

function App() {
  const [webpageLink, setWebpageLink] = useState("");
  const [userCommand, setUserCommand] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const res = await axios.post("http://localhost:3000/api/process", {
        webpageLink,
        userCommand,
      });

      setResponse(res.data);
    } catch (err) {
      setError("Failed to process request. Please try again.");
      console.error(err);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">AI Website Customizer</h1>
      
      <form onSubmit={handleSubmit} className="bg-white shadow-md p-6 rounded-lg w-full max-w-md">
        <label className="block mb-2 font-semibold">Website URL:</label>
        <input
          type="text"
          value={webpageLink}
          onChange={(e) => setWebpageLink(e.target.value)}
          placeholder="Enter website URL"
          className="w-full p-2 border rounded-md mb-4"
          required
        />

        <label className="block mb-2 font-semibold">Modification Request:</label>
        <textarea
          value={userCommand}
          onChange={(e) => setUserCommand(e.target.value)}
          placeholder="Describe how you want to modify the website..."
          className="w-full p-2 border rounded-md mb-4"
          rows="4"
          required
        />

        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
          disabled={loading}
        >
          {loading ? "Processing..." : "Submit"}
        </button>
      </form>

      {error && <p className="text-red-500 mt-4">{error}</p>}

      {response && (
        <div className="mt-6 bg-gray-200 p-4 rounded-lg w-full max-w-lg">
          <h2 className="font-semibold mb-2">Response:</h2>
          <pre className="text-sm break-all">{JSON.stringify(response, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
