import Head from "next/head";
import Layout from "../components/Layout";
import { Toaster } from "../components/ui";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Greenhouse by Emory Valley Center</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
      <Toaster />
    </>
  );
}
