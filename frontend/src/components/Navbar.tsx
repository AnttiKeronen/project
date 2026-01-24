import { Link, useNavigate } from "react-router-dom";
import { clearTheToken, isAuthenticated } from "../auth";

export function Navbar() {
  const nav = useNavigate();

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light border-bottom">
      <div className="container">
        <Link className="navbar-brand fw-bold" to="/">
          WebDevDrive
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#mainNavbar"
          aria-controls="mainNavbar"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>
        <div className="collapse navbar-collapse" id="mainNavbar">
          <div className="ms-auto d-flex align-items-center gap-2 mt-3 mt-lg-0">
            {isAuthenticated() ? (
              <>
                <Link className="btn btn-outline-primary btn-sm" to="/profile">
                  Profile
                </Link>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    clearTheToken();
                    nav("/login");
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link className="btn btn-primary btn-sm" to="/login">
                  Login
                </Link>
                <Link className="btn btn-outline-secondary btn-sm" to="/register">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
