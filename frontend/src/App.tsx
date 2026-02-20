import { signIn, signUp, signOut } from "@/lib/auth";

function App() {
  return (
    <div className="p-6 space-y-4">
      <button onClick={() => signUp("test@email.com", "password123")}>
        Sign Up
      </button>

      <button onClick={() => signIn("test@email.com", "password123")}>
        Sign In
      </button>

      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}

export default App;
