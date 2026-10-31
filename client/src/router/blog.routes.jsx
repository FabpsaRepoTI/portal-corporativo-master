import { Route } from "react-router-dom";
import PageLoader from "../components/PageLoader";
import BlogPage from "../pages/blog/BlogPage";
import BlogAdminPage from "../pages/blog/BlogAdminPage";

export default (
  <>
    <Route path="/cultura-digital"
      element={<PageLoader><BlogPage /></PageLoader>} />
    <Route path="/cultura-digital/admin"
      element={<PageLoader><BlogAdminPage /></PageLoader>} />
  </>
);
