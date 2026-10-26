import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import RoadWorkbenchEditor from "../RoadWorkbenchEditor";
import { roadWorkbenchExample } from "@/lib/engineering/roadWorkbenchExample";
import type { RoadDesignData } from "@/types/engineering";
import { useState } from "react";
jest.mock("../RoadWorkbench3D", () => ({
  __esModule: true,
  default: () => <div aria-label="Road 3D view" />,
}));

it("updates the linked design from editable input and preserves incomplete text without stale plots", () => {
  const e = roadWorkbenchExample();
  render(<RoadWorkbenchEditor {...e} />);
  fireEvent.change(screen.getByLabelText("PI 1 Easting (m)"), {
    target: { value: "499999" },
  });
  expect(screen.getByLabelText("Selected easting")).toHaveTextContent(
    "499999.000",
  );
  expect(
    screen.getByRole("status", { name: "Road edit status" }),
  ).toHaveTextContent("Unsaved example changes");
  fireEvent.change(screen.getByLabelText("PI 1 Easting (m)"), {
    target: { value: "" },
  });
  expect(screen.getByLabelText("PI 1 Easting (m)")).toHaveValue("");
  expect(screen.queryByLabelText("Plan view")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("finite decimal");
  fireEvent.change(screen.getByLabelText("PI 1 Easting (m)"), {
    target: { value: "499999" },
  });
  expect(screen.getByLabelText("Plan view")).toBeInTheDocument();
});
it("retains the draft after a failed save and confirms only an acknowledged exact submission", async () => {
  const e = roadWorkbenchExample();
  let finish!: (ok: boolean) => void;
  const save = jest.fn<Promise<boolean>, [RoadDesignData]>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <RoadWorkbenchEditor {...e} projectId="synthetic-project" onSave={save} />,
  );
  fireEvent.change(screen.getByLabelText("PI 1 Easting (m)"), {
    target: { value: "499999" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save road draft" }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].ips[0].easting).toBe(499999);
  expect(screen.getByLabelText("PI 1 Easting (m)")).toBeDisabled();
  await act(async () => finish(false));
  expect(screen.getByRole("alert")).toHaveTextContent("unconfirmed");
  expect(screen.getByLabelText("PI 1 Easting (m)")).toHaveValue("499999");
  fireEvent.click(screen.getByRole("button", { name: "Save road draft" }));
  await act(async () => finish(true));
  expect(
    screen.getByRole("status", { name: "Road edit status" }),
  ).toHaveTextContent("Road draft saved");
  expect(
    screen.getByRole("button", { name: "Save road draft" }),
  ).toBeDisabled();
});
it("holds local edits and blocks a save when the incoming saved road or reference changes", async () => {
  const e = roadWorkbenchExample(),
    save = jest.fn().mockResolvedValue(true);
  const { rerender } = render(
    <RoadWorkbenchEditor {...e} projectId="synthetic-project" onSave={save} />,
  );
  fireEvent.change(screen.getByLabelText("PI 1 Easting (m)"), {
    target: { value: "499999" },
  });
  const incoming = { ...e.road, roadName: "Changed saved road" };
  rerender(
    <RoadWorkbenchEditor
      road={incoming}
      reference={e.reference}
      projectId="synthetic-project"
      onSave={save}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("saved source changed");
  expect(screen.getByLabelText("PI 1 Easting (m)")).toHaveValue("499999");
  expect(
    screen.getByRole("button", { name: "Save road draft" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Discard local changes" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("PI 1 Easting (m)")).toHaveValue("500000"),
  );
  expect(
    screen.getByRole("heading", { name: "Changed saved road" }),
  ).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
it("allows profile/template editing and refuses an invalid template without calling the saver", () => {
  const e = roadWorkbenchExample(),
    save = jest.fn();
  render(
    <RoadWorkbenchEditor {...e} projectId="synthetic-project" onSave={save} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Vertical profile inputs" }),
  );
  fireEvent.change(screen.getByLabelText("VIP 1 Tangent intersection RL (m)"), {
    target: { value: "99" },
  });
  expect(screen.getByLabelText("Selected target level")).toHaveTextContent(
    "99.000",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Section template inputs" }),
  );
  fireEvent.change(screen.getByLabelText("Carriageway width (m)"), {
    target: { value: "-1" },
  });
  expect(screen.queryByLabelText("Plan view")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Save road draft" }),
  ).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
});
it("accepts the parent acknowledgement before its save promise settles without resetting or flagging a source conflict", async () => {
  const e = roadWorkbenchExample();
  function Host() {
    const [saved, setSaved] = useState(e.road);
    return (
      <RoadWorkbenchEditor
        road={saved}
        reference={e.reference}
        projectId="synthetic-project"
        onSave={async (submitted) => {
          setSaved(JSON.parse(JSON.stringify(submitted)) as RoadDesignData);
          return true;
        }}
      />
    );
  }
  render(<Host />);
  fireEvent.click(
    screen.getByRole("button", { name: "Vertical profile inputs" }),
  );
  fireEvent.change(screen.getByLabelText("VIP 1 Tangent intersection RL (m)"), {
    target: { value: "99" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save road draft" }));
  await waitFor(() =>
    expect(
      screen.getByRole("status", { name: "Road edit status" }),
    ).toHaveTextContent("Road draft saved"),
  );
  expect(
    screen.getByLabelText("VIP 1 Tangent intersection RL (m)"),
  ).toHaveValue("99");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("warns on unload and holds ordinary page links while a local design is unsaved", () => {
  const e = roadWorkbenchExample();
  const view = render(<RoadWorkbenchEditor {...e} />);
  fireEvent.change(screen.getByLabelText("PI 1 Easting (m)"), {
    target: { value: "499999" },
  });
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("link", { name: "Open your project" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Save or discard");
  view.unmount();
  const after = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
it("keeps a malformed saved template from crashing the page", () => {
  const e = roadWorkbenchExample();
  const malformed = {
    ...e.road,
    crossSectionTemplate: null,
  } as unknown as RoadDesignData;
  expect(() =>
    render(<RoadWorkbenchEditor road={malformed} reference={e.reference} />),
  ).not.toThrow();
  expect(screen.getByRole("alert")).toHaveTextContent("saved road inputs");
});
