"use client";

import { useEffect } from "react";

export default function CartPage() {
  useEffect(() => {
    window.location.replace("/#/cart");
  }, []);

  return <p>Opening your Wirefen cart…</p>;
}
