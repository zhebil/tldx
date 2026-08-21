import { Doc, Frame, Group, Box, Edge } from "tldsl";

// C4 container diagram, canonical subject: Big Bank plc's internet banking
// system (simonbrown.je/c4). People and external systems sit outside the
// boundary; the five containers that make up the system sit inside it.

export default function C4Container() {
  return (
    <Doc layout="col" gap="96">
      <Group id="people" layout="row" gap="96">
        <Box
          id="customer"
          maxW="240"
          label={"Personal Banking Customer\n[Person]\nA customer of the bank, with personal bank accounts."}
          geo="ellipse"
          color="blue"
        />
        <Box
          id="staff"
          maxW="240"
          label={"Customer Service Staff\n[Person]\nStaff within the bank who help customers with their questions."}
          geo="ellipse"
          color="blue"
        />
      </Group>

      <Frame id="ibs" name="Internet Banking System" layout="row" gap="64">
        <Box
          id="web-app"
          maxW="240"
          label={"Web Application\n[Container: Java, Spring MVC]\nDelivers the static content and the internet banking single page application."}
          color="light-blue"
        />
        <Box
          id="spa"
          maxW="240"
          label={"Single-Page Application\n[Container: JavaScript, Angular]\nProvides all of the internet banking functionality to customers via their web browser."}
          color="light-blue"
        />
        <Box
          id="mobile-app"
          maxW="240"
          label={"Mobile App\n[Container: Xamarin]\nProvides a limited subset of the internet banking functionality to customers via their mobile device."}
          color="light-blue"
        />
        <Box
          id="api-app"
          maxW="240"
          label={"API Application\n[Container: Java, Spring MVC]\nProvides internet banking functionality via a JSON/HTTPS API."}
          color="light-blue"
        />
        <Box
          id="database"
          maxW="240"
          label={"Database\n[Container: Oracle Database Schema]\nStores user registration information, hashed auth credentials, access logs, etc."}
          geo="ellipse"
          color="green"
        />
      </Frame>

      <Group id="external" layout="row" gap="96">
        <Box
          id="mainframe"
          maxW="240"
          label={"Mainframe Banking System\n[Software System]\nStores all of the core banking information about customers, accounts, transactions, etc."}
          color="grey"
          dash="dashed"
        />
        <Box
          id="email-system"
          maxW="240"
          label={"E-mail System\n[Software System]\nThe internal Microsoft Exchange e-mail system."}
          color="grey"
          dash="dashed"
        />
      </Group>

      <Edge from="customer" to="web-app" label="Visits bigbank.com/ib using [HTTPS]" font="sans" size="s" />
      <Edge from="customer" to="spa" label="Views account balances, makes payments using [HTTPS/JSON]" font="sans" size="s" />
      <Edge from="customer" to="mobile-app" label="Views account balances, makes payments using [HTTPS/JSON]" font="sans" size="s" />
      <Edge from="web-app" to="spa" label="Delivers to the customer's web browser" font="sans" size="s" />
      <Edge from="spa" to="api-app" label="Makes API calls to [JSON/HTTPS]" font="sans" size="s" />
      <Edge from="mobile-app" to="api-app" label="Makes API calls to [JSON/HTTPS]" font="sans" size="s" />
      <Edge from="api-app" to="database" label="Reads from and writes to [JDBC]" font="sans" size="s" />
      <Edge from="api-app" to="mainframe" label="Makes API calls to [XML/HTTPS]" font="sans" size="s" />
      <Edge from="api-app" to="email-system" label="Sends e-mail using [SMTP]" font="sans" size="s" />
      <Edge from="email-system" to="customer" label="Sends e-mail to" font="sans" size="s" />
      <Edge from="staff" to="mainframe" label="Uses to view customer information and process transactions using [HTTPS]" font="sans" size="s" />
    </Doc>
  );
}
