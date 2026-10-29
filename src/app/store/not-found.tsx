import Link from "next/link";
import { btnPrimary, container, serif } from "./_components/ui";

export default function StoreNotFound() {
  return (
    <div className={`${container} py-24 text-center`}>
      <h1 className={`${serif} text-[40px] font-semibold tracking-tight`}>Page not found</h1>
      <p className="mt-3 text-[17px] text-[#5F655F]">We could not find that page or order.</p>
      <Link href="/store" className={`${btnPrimary} mt-8`}>Back to the store</Link>
    </div>
  );
}
