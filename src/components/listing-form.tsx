"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isFrozenStatus } from "@/lib/listing-state";
import { pricePerSqft } from "@/lib/property-price";
import {
  Building2,
  House,
  LandPlot,
  Sofa,
  ArrowLeft,
  ArrowRight,
  UploadCloud,
  Check,
  X,
  Star,
  MoveLeft,
  MoveRight,
  LoaderCircle,
} from "lucide-react";
import type { Actor } from "@/lib/auth";
import { CATEGORIES, money } from "@/lib/constants";
import { api, ErrorBox, Field, Loading, Photo, Select, useData } from "./ui";
import { listingSchema } from "@/lib/validation";
const ICONS = [LandPlot, Building2, House, Sofa];
const STEPS = [0, 2, 3, 4];
export function ListingForm({
  user,
  editId,
}: {
  user: Actor;
  editId?: string;
}) {
  void user;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [v, setV] = useState<any>({
    categoryId: "",
    optionId: "",
    title: "",
    price: "",
    negotiable: false,
    state: "Telangana",
    city: "Hyderabad",
    locality: "",
    address: "",
    pinCode: "",
    description: "",
    listedBy: "Owner",
    property: {
      type: "Apartment",
      facing: "East",
      furnishing: "Semi-furnished",
      constructionStatus: "Ready to Move",
    },
    furniture: { material: "", condition: "Good", quantity: 1 },
  });
  const [photos, setPhotos] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [frozen, setFrozen] = useState(false);
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const config = useData("options");
  const stepIndex = STEPS.indexOf(step);
  useEffect(() => {
    if (!editId) return;
    api("listings/" + editId)
      .then((l) => {
        if (isFrozenStatus(l.status)) {
          setFrozen(true);
          return;
        }
        setV({
          ...l,
          property: l.property
            ? {
                ...l.property,
                availabilityDate:
                  l.property.availabilityDate?.slice(0, 10) || "",
              }
            : {},
          furniture: l.furniture || {},
        });
        setPhotos(l.photos);
        setStep(3);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editId]);
  const category = CATEGORIES.find((c) => c.id === v.categoryId);
  const option = category?.options.find(
    (o) =>
      v.optionId === category.id + "-" + o.toLowerCase().replaceAll(" ", "-"),
  );
  const furniture = v.categoryId === "furniture";
  const plot = v.categoryId === "plots";
  function update(key: string, value: any) {
    setError("");
    setV((s: any) => ({ ...s, [key]: value }));
  }
  function nested(key: string, value: any) {
    setError("");
    setV((s: any) => ({
      ...s,
      [furniture ? "furniture" : "property"]: {
        ...s[furniture ? "furniture" : "property"],
        [key]: value,
      },
    }));
  }
  const n = furniture ? v.furniture : v.property;
  const rate = pricePerSqft(v.categoryId, v.price, v.property);
  const field = (
    key: string,
    title: string,
    type = "text",
    required = false,
  ) => (
    <Field
      key={key}
      label={title}
      type={type}
      required={required}
      value={n[key] ?? ""}
      min={type === "number" ? 0 : undefined}
      step={type === "number" ? "any" : undefined}
      onChange={(e) => nested(key, e.target.value)}
    />
  );
  const select = (
    key: string,
    title: string,
    options: string[],
    required = true,
  ) => (
    <Select
      key={key}
      label={title}
      options={options}
      value={n[key] || ""}
      required={required}
      onChange={(x) => nested(key, x)}
    />
  );
  async function upload(files: FileList | null) {
    if (!files) return;
    const selectedFiles = Array.from(files);
    setError("");
    const limit = config.data?.maxPhotos || 12;
    const invalid = selectedFiles.find(
      (file) =>
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > (config.data?.maxImageMB || 10) * 1024 * 1024,
    );
    if (invalid) {
      setError(
        `${invalid.name}: choose a JPEG, PNG or WebP image under ${config.data?.maxImageMB || 10} MB.`,
      );
      return;
    }
    if (photos.length + selectedFiles.length > limit) {
      setError(`You can upload up to ${limit} photos.`);
      return;
    }
    setBusy(true);
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${selectedFiles.length}`);
        const data = new FormData();
        data.append("file", selectedFiles[i]);
        const p = await api("photos", { method: "POST", body: data });
        setPhotos((old) => [...old, p]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  function next() {
    setError("");
    if (step === 0 && !v.categoryId) {
      setError("Choose a category to continue.");
      return;
    }
    if (step === 0 && !v.optionId) {
      setError(
        furniture
          ? "Choose a furniture type to continue."
          : "Choose Sale, Rent or Lease from the available options.",
      );
      return;
    }
    if (step === 2 && !photos.length) {
      setError("Add at least one photo.");
      return;
    }
    if (step === 3 && !formRef.current?.reportValidity()) return;
    if (step === 3) {
      const validation = listingSchema.safeParse({
        ...v,
        photoIds: photos.map((p) => p.id),
        ...(furniture ? { property: undefined } : { furniture: undefined }),
      });
      if (!validation.success) {
        setError(
          validation.error.issues
            .map(
              (issue) =>
                `${issue.path.join(" ").replace(/([A-Z])/g, " $1")}: ${issue.message}`,
            )
            .join(" · "),
        );
        return;
      }
      if (option === "Rent" && (n.deposit === "" || n.deposit === undefined)) {
        setError(
          "Enter the security deposit. Use 0 if no deposit is required.",
        );
        return;
      }
    }
    if (
      step === 3 &&
      !furniture &&
      Number(n.carpetArea) > Number(n.superArea)
    ) {
      setError("Carpet area cannot exceed super built-up area.");
      return;
    }
    setStep(STEPS[stepIndex + 1]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...v,
        photoIds: photos.map((p) => p.id),
        ...(furniture ? { property: undefined } : { furniture: undefined }),
      };
      const l = await api("listings" + (editId ? "/" + editId : ""), {
        method: editId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setSaved(true);
      router.push(
        editId
          ? "/listings/" + l.id + "?saved=1"
          : "/categories?" +
              new URLSearchParams({
                category: v.categoryId,
                option: v.optionId,
                saved: l.id,
              }),
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  if (loading) return <Loading />;
  if (frozen)
    return (
      <section className="panel">
        <h1>Property frozen</h1>
        <p>
          Only Admin can resume this property before its details can be edited.
        </p>
        <Link className="button" href={"/listings/" + editId}>
          Open property details
        </Link>
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{editId ? "Edit listing" : "Upload a new listing"}</h1>
          <p>Add a property or furniture item to your shared inventory.</p>
        </div>
        <span className="secure-note">
          {editId
            ? "Changes are saved after review"
            : "Your listing appears in Categories after upload"}
        </span>
      </div>
      <div className="wizard">
        <ol className="stepper">
          {["Category & purpose", "Photos", "Details", "Review"].map((s, i) => (
            <li
              key={s}
              className={
                i === stepIndex ? "current" : i < stepIndex ? "complete" : ""
              }
              aria-current={i === stepIndex ? "step" : undefined}
            >
              <span>{i < stepIndex ? <Check size={16} /> : i + 1}</span>
              <strong>{s}</strong>
            </li>
          ))}
        </ol>
        <ErrorBox message={error} />
        {saved && (
          <div role="status" className="success-box">
            Listing saved. Opening your saved listing…
          </div>
        )}
        {step === 0 && (
          <section>
            <h2>What would you like to list?</h2>
            <p>Choose a category to see the right details for your listing.</p>
            <div className="category-choices">
              {CATEGORIES.map((c, i) => {
                const Icon = ICONS[i];
                return (
                  <button
                    key={c.id}
                    className={v.categoryId === c.id ? "selected" : ""}
                    aria-pressed={v.categoryId === c.id}
                    onClick={() => {
                      if (v.categoryId === c.id) return;
                      update("categoryId", c.id);
                      update("optionId", "");
                      setV((s: any) => ({
                        ...s,
                        property: {
                          type:
                            c.id === "plots"
                              ? "Residential"
                              : c.id === "houses"
                                ? "Independent House"
                                : "Apartment",
                          facing: "East",
                          ...(c.id !== "plots"
                            ? {
                                furnishing: "Semi-furnished",
                                constructionStatus: "Ready to Move",
                              }
                            : {}),
                        },
                        furniture: {
                          material: "",
                          condition: "Good",
                          quantity: 1,
                        },
                      }));
                    }}
                  >
                    <Icon size={48} />
                    <strong>{c.name}</strong>
                    <small>
                      {
                        [
                          "Residential, commercial and open land",
                          "Apartments, studio and multistorey flats",
                          "Independent homes, villas and duplexes",
                          "Home and office furniture",
                        ][i]
                      }
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {step === 0 && category && (
          <section>
            <h2>
              {furniture
                ? "Choose furniture subtype"
                : "Is this property for sale, rent or lease?"}
            </h2>
            <p>{category?.name} listings</p>
            <div className="subcategory-choices">
              {category?.options.map((o) => {
                const id =
                  category.id + "-" + o.toLowerCase().replaceAll(" ", "-");
                return (
                  <button
                    key={o}
                    className={v.optionId === id ? "selected" : ""}
                    onClick={() => update("optionId", id)}
                    aria-pressed={v.optionId === id}
                  >
                    {o}
                    <ArrowRight size={20} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {step === 2 && (
          <section>
            <h2>Show your listing at its best</h2>
            <p>
              Add up to {config.data?.maxPhotos || 12} photos. The first image
              is the cover.
            </p>
            <label className="upload-zone">
              <UploadCloud size={36} />
              <strong>Select photos</strong>
              <span>
                JPEG, PNG or WebP · up to {config.data?.maxImageMB || 10} MB
                each
              </span>
              <input
                aria-label="Upload listing photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {busy && (
              <p className="upload-progress" role="status">
                <LoaderCircle className="spin" size={18} />
                {progress}
              </p>
            )}
            <div className="photo-manager">
              {photos.map((p, i) => (
                <div key={p.id}>
                  <Photo id={p.id} alt={"Listing photo " + (i + 1)} />
                  {i === 0 && (
                    <span className="cover-label">
                      <Star size={12} />
                      Cover
                    </span>
                  )}
                  <div className="photo-controls">
                    <button
                      aria-label={"Move photo " + (i + 1) + " left"}
                      disabled={busy || i === 0}
                      onClick={() =>
                        setPhotos((a) => {
                          const b = [...a];
                          [b[i - 1], b[i]] = [b[i], b[i - 1]];
                          return b;
                        })
                      }
                    >
                      <MoveLeft size={16} />
                    </button>
                    <button
                      aria-label={"Set photo " + (i + 1) + " as cover"}
                      disabled={busy || i === 0}
                      onClick={() =>
                        setPhotos((a) => [a[i], ...a.filter((_, j) => j !== i)])
                      }
                    >
                      <Star size={16} />
                    </button>
                    <button
                      aria-label={"Move photo " + (i + 1) + " right"}
                      disabled={busy || i === photos.length - 1}
                      onClick={() =>
                        setPhotos((a) => {
                          const b = [...a];
                          [b[i + 1], b[i]] = [b[i], b[i + 1]];
                          return b;
                        })
                      }
                    >
                      <MoveRight size={16} />
                    </button>
                    <button
                      aria-label={"Remove photo " + (i + 1)}
                      disabled={busy}
                      onClick={() =>
                        setPhotos((a) => a.filter((_, j) => j !== i))
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {step === 3 && (
          <section>
            <h2>Listing details</h2>
            <p>
              {category?.name} / {option} · Fields marked * are required.
            </p>
            <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
              <h3>Basic information</h3>
              <div className="form-grid">
                <Field
                  label="Listing title"
                  required
                  maxLength={500}
                  placeholder={
                    plot
                      ? "e.g. 2400 sqft residential plot in Shadnagar"
                      : furniture
                        ? "e.g. Solid wood three-seater sofa"
                        : "e.g. 3 BHK flat in Kondapur"
                  }
                  value={v.title}
                  onChange={(e) => update("title", e.target.value)}
                />
                <Field
                  label={
                    furniture
                      ? "Selling price (₹)"
                      : option === "Rent"
                        ? "Monthly rent (₹)"
                        : option === "Lease"
                          ? "Lease amount (₹)"
                          : "Sale price (₹)"
                  }
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={v.price}
                  onChange={(e) => update("price", e.target.value)}
                />
                {(plot || v.categoryId === "flats") && (
                  <Field
                    label={
                      option === "Rent"
                        ? "Monthly price per sqft (₹)"
                        : "Price per sqft (₹)"
                    }
                    readOnly
                    value={rate === null ? "" : rate.toFixed(2)}
                    placeholder="Enter price and area"
                    hint={
                      plot
                        ? "Calculated automatically: price ÷ plot area."
                        : "Calculated automatically: price ÷ super built-up area."
                    }
                  />
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={v.negotiable}
                    onChange={(e) => update("negotiable", e.target.checked)}
                  />
                  Price negotiable
                </label>
                {!furniture && (
                  <Select
                    label="Listed by"
                    options={["Owner", "Dealer", "Builder"]}
                    value={v.listedBy}
                    required
                    onChange={(x) => update("listedBy", x)}
                  />
                )}
              </div>
              <h3>
                {furniture
                  ? "Furniture specifications"
                  : "Property specifications"}
              </h3>
              <div className="form-grid">
                {furniture ? (
                  <>
                    {field("brand", "Brand")}
                    {field("material", "Material", "text", true)}
                    {select("condition", "Condition", [
                      "New",
                      "Like new",
                      "Good",
                      "Fair",
                    ])}
                    {field("age", "Age (years)", "number")}
                    {field("dimensions", "Dimensions (include units)")}
                    {field("color", "Color")}
                    {field("quantity", "Quantity", "number", true)}
                  </>
                ) : (
                  <>
                    {select(
                      "type",
                      plot ? "Plot type" : "Type",
                      plot
                        ? ["Residential", "Commercial", "Agricultural", "Other"]
                        : [
                            "Apartment",
                            "Studio",
                            "Independent House",
                            "Villa",
                            "Duplex",
                            "Other",
                          ],
                    )}
                    {plot ? (
                      <>
                        {field("plotArea", "Plot area (sqft)", "number", true)}
                        {field("length", "Length (ft)", "number")}
                        {field("breadth", "Breadth (ft)", "number")}
                        {field("roadWidth", "Road width (ft)", "number")}
                      </>
                    ) : (
                      <>
                        {field("bhk", "Bedrooms / BHK", "number", true)}
                        {field("bathrooms", "Bathrooms", "number", true)}
                        {field(
                          "superArea",
                          "Super built-up area (sqft)",
                          "number",
                          true,
                        )}
                        {field(
                          "carpetArea",
                          "Carpet area (sqft)",
                          "number",
                          true,
                        )}
                        {select("furnishing", "Furnishing", [
                          "Unfurnished",
                          "Semi-furnished",
                          "Fully furnished",
                        ])}
                        {field("parking", "Car parking spaces", "number")}
                        {field(
                          "maintenance",
                          "Monthly maintenance (₹)",
                          "number",
                        )}
                        {field("totalFloors", "Total floors", "number", true)}
                        {v.categoryId === "flats" &&
                          field("floorNo", "Floor number", "number", true)}
                      </>
                    )}
                    {select("facing", "Facing", [
                      "East",
                      "West",
                      "North",
                      "South",
                      "North-East",
                      "North-West",
                      "South-East",
                      "South-West",
                    ])}
                    {field(
                      "projectName",
                      plot ? "Project / layout name" : "Project name",
                    )}
                    {!plot &&
                      field("availabilityDate", "Availability date", "date")}
                    {option === "Rent" && (
                      <>
                        {field(
                          "deposit",
                          "Security deposit (₹)",
                          "number",
                          true,
                        )}
                        {field("tenantType", "Preferred tenant type")}
                      </>
                    )}
                    {option === "Sale" && !plot && (
                      <>
                        {select("constructionStatus", "Construction status", [
                          "New Launch",
                          "Under Construction",
                          "Ready to Move",
                        ])}
                        {field("propertyAge", "Property age (years)", "number")}
                      </>
                    )}
                    {option === "Lease" && (
                      <>
                        {select("billingPeriod", "Lease billing period", [
                          "Monthly",
                          "Quarterly",
                          "Yearly",
                          "One-time",
                        ])}
                        {field("leaseDuration", "Lease duration", "text", true)}
                        {field("deposit", "Lease deposit (₹)", "number", true)}
                      </>
                    )}
                  </>
                )}
              </div>
              <h3>Location</h3>
              <div className="form-grid">
                {[
                  ["state", "State"],
                  ["city", "City"],
                  ["locality", "Locality"],
                  ["address", "Address"],
                  ["pinCode", "PIN code (optional)"],
                ].map(([key, title]) => (
                  <Field
                    key={key}
                    label={title}
                    required={key !== "pinCode"}
                    value={v[key]}
                    pattern={key === "pinCode" ? "[0-9]{6}" : undefined}
                    onChange={(e) => update(key, e.target.value)}
                  />
                ))}
              </div>
              <label className="field">
                <span>Description *</span>
                <textarea
                  required
                  minLength={10}
                  maxLength={10000}
                  rows={5}
                  value={v.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </label>
            </form>
          </section>
        )}
        {step === 4 && (
          <section>
            <h2>Review your listing</h2>
            <p>
              Check the information below before making it visible to your team.
            </p>
            <div className="review-layout">
              <Photo id={photos[0]?.id} alt={v.title} />
              <div>
                <span className="muted">
                  {category?.name} / {option}
                </span>
                <h2>{v.title}</h2>
                <strong className="price">
                  {money(v.price)}
                  {option === "Rent" ? " / month" : ""}
                </strong>
                {rate !== null && (
                  <p>
                    {money(rate)} / sqft{option === "Rent" ? " / month" : ""}
                  </p>
                )}
                <p>
                  {v.address}, {v.locality}, {v.city}, {v.state} {v.pinCode}
                </p>
                <p>{v.description}</p>
                <small>
                  {photos.length} photos ·{" "}
                  {v.negotiable ? "Negotiable" : "Fixed price"}
                </small>
              </div>
            </div>
            <dl className="attribute-grid">
              {Object.entries(n)
                .filter(
                  ([k, val]) =>
                    val !== "" &&
                    val !== null &&
                    val !== undefined &&
                    k !== "listingId",
                )
                .map(([k, val]) => (
                  <div key={k}>
                    <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                    <dd>{String(val)}</dd>
                  </div>
                ))}
            </dl>
          </section>
        )}
        <footer className="wizard-actions">
          <button
            className="button secondary"
            disabled={step === 0 || busy}
            onClick={() => {
              setError("");
              setStep(STEPS[stepIndex - 1]);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <ArrowLeft size={17} />
            Back
          </button>
          <span>Step {stepIndex + 1} of 4</span>
          {step < 4 ? (
            <button className="button" disabled={busy} onClick={next}>
              Continue
              <ArrowRight size={17} />
            </button>
          ) : (
            <button className="button" disabled={busy || saved} onClick={save}>
              {busy ? "Saving…" : editId ? "Save changes" : "Upload listing"}
              <Check size={17} />
            </button>
          )}
        </footer>
      </div>
    </>
  );
}
