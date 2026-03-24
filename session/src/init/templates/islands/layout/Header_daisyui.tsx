export default function Header({
  activeUrl,
  username,
}: {
  activeUrl?: string;
  username?: string;
}) {
  return (
    <div class="navbar bg-base-100 shadow-sm border-b">
      <div class="flex-1">
        <a href="/" class="btn btn-ghost text-xl">App Name</a>
      </div>
      <div class="flex-none gap-2">
        {username
          ? (
            <details class="dropdown dropdown-end">
              <summary class="btn m-1">
                {username}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <ul class="dropdown-content menu bg-base-100 rounded-box z-50 w-52 p-2 shadow-sm">
                <li>
                  <button
                    type="submit"
                    form="logout-form"
                    class="text-error justify-start"
                  >
                    Logout
                  </button>
                </li>
              </ul>
              <form
                id="logout-form"
                method="POST"
                action="/logout"
                class="hidden"
              />
            </details>
          )
          : (
            <div class="flex gap-2 items-center">
              {activeUrl !== "/login" && (
                <a href="/login" class="btn btn-ghost">
                  Login
                </a>
              )}
              {activeUrl !== "/register" && (
                <a href="/register" class="btn btn-primary">
                  Register
                </a>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
