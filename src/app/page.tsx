import { redirectIfLoggedIn } from "./lib/commonFunctions";
import Link from "next/link";
import FeaturedTopics from "./components/home/FeaturedTopics";

export default async function Home() {
  await redirectIfLoggedIn();
  return (
    <div className="container">
      {/* Hero Section */}
      <div className="row justify-content-center py-5">
        <div className="col-lg-10 text-center">
          <h1 className="display-4 fw-bold mb-4">
            Welcome to Consensus Engine
          </h1>
          <p className="lead mb-4 text-muted">
            Join the conversation and discover what people are debating about. 
            Share your perspective, vote on posts, and help build consensus on important topics.
          </p>
          <div className="d-flex gap-3 justify-content-center flex-wrap">
            <Link href="/register" className="btn btn-primary btn-lg px-5">
              <i className="fa-solid fa-user-plus me-2" aria-hidden="true"></i>
              Get Started
            </Link>
            <Link href="/login" className="btn btn-outline-secondary btn-lg px-5">
              <i className="fa-solid fa-sign-in-alt me-2" aria-hidden="true"></i>
              Log In
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="row py-5">
        <div className="col-md-4 mb-4">
          <div className="text-center">
            <div className="mb-3">
              <i className="fa-solid fa-comments fa-3x text-primary" aria-hidden="true"></i>
            </div>
            <h3 className="h5">Engage in Debates</h3>
            <p className="text-muted">
              Participate in thoughtful discussions on topics that matter to you
            </p>
          </div>
        </div>
        <div className="col-md-4 mb-4">
          <div className="text-center">
            <div className="mb-3">
              <i className="fa-solid fa-vote-yea fa-3x text-primary" aria-hidden="true"></i>
            </div>
            <h3 className="h5">Vote on Posts</h3>
            <p className="text-muted">
              Support compelling posts and help surface the best ideas
            </p>
          </div>
        </div>
        <div className="col-md-4 mb-4">
          <div className="text-center">
            <div className="mb-3">
              <i className="fa-solid fa-lightbulb fa-3x text-primary" aria-hidden="true"></i>
            </div>
            <h3 className="h5">Build Consensus</h3>
            <p className="text-muted">
              Work together to find common ground and shared understanding
            </p>
          </div>
        </div>
      </div>

      {/* Featured Topics Section */}
      <div className="py-5">
        <div className="row mb-4">
          <div className="col align-content-center text-center">
            <h2 className="h2 mb-1">Featured Debates</h2>
            <p className="text-muted">Explore current discussions and join the conversation</p>
          </div>
        </div>
        <FeaturedTopics />
      </div>

      {/* Call to Action */}
      <div className="row justify-content-center py-5">
        <div className="col-lg-8 text-center">
          <div className="card border-primary">
            <div className="card-body py-5">
              <h3 className="h4 mb-3">Ready to Join?</h3>
              <p className="mb-4">
                Create an account to start participating in debates, voting on posts, 
                and helping build consensus on important topics.
              </p>
              <Link href="/register" className="btn btn-primary btn-lg">
                <i className="fa-solid fa-user-plus me-2" aria-hidden="true"></i>
                Create Free Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
