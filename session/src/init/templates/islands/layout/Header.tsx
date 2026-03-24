// deno-lint-ignore no-import-prefix
import { useSignal } from "npm:@preact/signals@^2.8.2";

export default function Header({
  activeUrl,
  username,
}: {
  activeUrl?: string;
  username?: string;
}) {
  const isMenuOpen = useSignal(false);

  return (
    <header class="flex justify-between items-center p-4 bg-gray-100 border-b">
      <div class="text-xl font-bold">
        <a href="/">App Name</a>
      </div>
      <div>
        {username
          ? (
            <div class="relative">
              <button
                type="button"
                class="flex items-center gap-2 px-3 py-2 bg-white border rounded hover:bg-gray-200"
                onClick={() => (isMenuOpen.value = !isMenuOpen.value)}
              >
                {username} <span>▼</span>
              </button>
              {isMenuOpen.value && (
                <div class="absolute right-0 mt-2 w-48 bg-white border rounded shadow-lg z-50 overflow-hidden">
                  <form method="POST" action="/logout">
                    <button
                      type="submit"
                      class="w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600 block"
                    >
                      Logout
                    </button>
                  </form>
                </div>
              )}
            </div>
          )
          : (
            <div class="flex gap-4 items-center">
              {activeUrl !== "/login" && (
                <a href="/login" class="hover:underline text-blue-600">
                  Login
                </a>
              )}
              {activeUrl !== "/register" && (
                <a
                  href="/register"
                  class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Register
                </a>
              )}
            </div>
          )}
      </div>
    </header>
  );
}
