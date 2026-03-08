import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Profile } from "./Profile";

// ── mock the profileService so tests never hit the real network ──────────────
vi.mock("../services/profile", () => ({
  profileService: {
    getMe: vi.fn(),
    getUser: vi.fn(),
    getProvider: vi.fn(),
  },
}));

import { profileService } from "../services/profile";

// ── helpers ──────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();

const customerUser = {
  _id: "user-001",
  supabaseId: "sb-001",
  fullName: "Alice Customer",
  email: "alice@example.com",
  role: "customer",
  avatarUrl: undefined,
};

const providerUser = {
  _id: "prov-001",
  businessName: "Bob's Plumbing",
  fullName: "Bob Provider",
  email: "bob@example.com",
  role: "provider",
  avatarUrl: undefined,
  serviceCategory: "Plumbing",
  hourlyRate: 75,
  rating: 4.5,
  verified: true,
  availabilityStatus: "AVAILABLE",
  description: "Expert plumber with 10 years of experience.",
};

// ── test suites ───────────────────────────────────────────────────────────────

describe("Profile — loading state", () => {
  it("shows a loading spinner initially", () => {
    // getUser never resolves during this test
    vi.mocked(profileService.getUser).mockReturnValue(new Promise(() => {}));
    render(
      <Profile
        profileId="user-001"
        onNavigate={mockNavigate}
        currentUser={{ email: "alice@example.com", role: "customer" }}
      />
    );
    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
  });
});

describe("Profile — error state", () => {
  it("shows error message when no profileId is given", async () => {
    render(
      <Profile
        profileId=""
        onNavigate={mockNavigate}
        currentUser={{ email: "alice@example.com", role: "customer" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText(/error loading profile/i)).toBeInTheDocument()
    );
  });
});

describe("Profile — customer user", () => {
  beforeEach(() => {
    vi.mocked(profileService.getUser).mockResolvedValue({
      success: true,
      data: customerUser,
    });
    vi.mocked(profileService.getProvider).mockResolvedValue({
      success: false,
      error: "not found",
    });
  });

  it("renders customer full name", async () => {
    render(
      <Profile
        profileId="user-001"
        onNavigate={mockNavigate}
        currentUser={{ email: "alice@example.com", role: "customer" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText("Alice Customer")).toBeInTheDocument()
    );
  });

  it("shows Customer role badge", async () => {
    render(
      <Profile
        profileId="user-001"
        onNavigate={mockNavigate}
        currentUser={{ email: "alice@example.com", role: "customer" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText("Customer")).toBeInTheDocument()
    );
  });
});

describe("Profile — provider user", () => {
  beforeEach(() => {
    vi.mocked(profileService.getProvider).mockResolvedValue({
      success: true,
      data: providerUser,
    });
    vi.mocked(profileService.getUser).mockResolvedValue({
      success: false,
      error: "not found",
    });
  });

  it("renders provider business name", async () => {
    render(
      <Profile
        profileId="prov-001"
        onNavigate={mockNavigate}
        initialType="provider"
        currentUser={{ email: "bob@example.com", role: "provider" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText("Bob's Plumbing")).toBeInTheDocument()
    );
  });

  it("shows Service Provider badge", async () => {
    render(
      <Profile
        profileId="prov-001"
        onNavigate={mockNavigate}
        initialType="provider"
        currentUser={{ email: "bob@example.com", role: "provider" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText("Service Provider")).toBeInTheDocument()
    );
  });

  it("shows service category", async () => {
    render(
      <Profile
        profileId="prov-001"
        onNavigate={mockNavigate}
        initialType="provider"
        currentUser={{ email: "bob@example.com", role: "provider" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText("Plumbing")).toBeInTheDocument()
    );
  });

  it("shows rating", async () => {
    render(
      <Profile
        profileId="prov-001"
        onNavigate={mockNavigate}
        initialType="provider"
        currentUser={{ email: "bob@example.com", role: "provider" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText("4.5")).toBeInTheDocument()
    );
  });

  it("shows verified badge for verified provider", async () => {
    render(
      <Profile
        profileId="prov-001"
        onNavigate={mockNavigate}
        initialType="provider"
        currentUser={{ email: "bob@example.com", role: "provider" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText(/verified provider/i)).toBeInTheDocument()
    );
  });
});

describe("Profile — 'me' profile", () => {
  beforeEach(() => {
    vi.mocked(profileService.getMe).mockResolvedValue({
      success: true,
      data: { ...customerUser, type: "user" } as any,
    });
  });

  it("renders own profile without error", async () => {
    render(
      <Profile
        profileId="me"
        onNavigate={mockNavigate}
        currentUser={{ email: "alice@example.com", role: "customer" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByText("Alice Customer")).toBeInTheDocument()
    );
  });

  it("shows Edit Profile button for own profile", async () => {
    render(
      <Profile
        profileId="me"
        onNavigate={mockNavigate}
        currentUser={{ email: "alice@example.com", role: "customer" }}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /edit profile/i })).toBeInTheDocument()
    );
  });
});