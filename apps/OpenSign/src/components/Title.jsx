import { Helmet } from "react-helmet";

function Title({ title, drive }) {
  const appName =
    "Signit™";
  return (
    <Helmet>
      <title>{drive ? title : `${title} - ${appName}`}</title>
      <meta name="description" content={`${title} - ${appName}`} />
      <link
        rel="icon"
        type="image/x-icon"
        href="/favicon.ico"
      />
    </Helmet>
  );
}

export default Title;
